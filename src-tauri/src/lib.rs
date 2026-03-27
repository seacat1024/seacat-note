use aes_gcm_siv::{aead::{Aead, KeyInit}, Aes256GcmSiv, Nonce};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, io::{Cursor, Read, Write}, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;
use walkdir::WalkDir;
use zip::{write::FileOptions, ZipArchive, ZipWriter};

const DB_NAME: &str = "seacat-note.db";
const LEGACY_JSON: &str = "app-data.json";
const VAULT_DB_NAME: &str = "seacat-note-vault.db";
const VAULT_META_NAME: &str = "seacat-note-vault-meta.json";
const APP_META_NAME: &str = "seacat-note-meta.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Folder {
    id: String,
    parent_id: Option<String>,
    name: String,
    sort: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: String,
    folder_id: String,
    title: String,
    content: String,
    sort: i32,
    note_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppData {
    folders: Vec<Folder>,
    notes: Vec<Note>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFolder {
    id: String,
    parent_id: Option<String>,
    name: String,
    sort: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultEntry {
    id: String,
    folder_id: String,
    title: String,
    content: String,
    sort: i32,
    entry_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultData {
    folders: Vec<VaultFolder>,
    entries: Vec<VaultEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultStatus {
    initialized: bool,
    unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultMeta {
    password_hash: String,
    enc_salt_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppAuthMeta {
    password_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppAuthStatus {
    initialized: bool,
    unlocked: bool,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupExportResult {
    file_path: String,
    file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupEnvelope {
    format: String,
    encrypted: bool,
    salt_b64: String,
    payload_b64: String,
}

static VAULT_KEY: OnceLock<Mutex<Option<[u8; 32]>>> = OnceLock::new();
static APP_UNLOCKED: OnceLock<Mutex<bool>> = OnceLock::new();

fn vault_key_store() -> &'static Mutex<Option<[u8; 32]>> {
    VAULT_KEY.get_or_init(|| Mutex::new(None))
}

fn app_unlocked_store() -> &'static Mutex<bool> {
    APP_UNLOCKED.get_or_init(|| Mutex::new(false))
}

fn empty_data() -> AppData {
    AppData { folders: vec![], notes: vec![] }
}

fn empty_vault() -> VaultData {
    VaultData { folders: vec![], entries: vec![] }
}


fn zip_relative_name(base: &Path, path: &Path) -> Result<String, String> {
    let rel = path
        .strip_prefix(base)
        .map_err(|e| format!("failed to strip prefix: {e}"))?;

    let s = rel.to_string_lossy().replace('\\', "/");
    if s.is_empty() {
        return Err("empty relative path".to_string());
    }
    Ok(s)
}

fn build_backup_zip_bytes(app: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    let data_dir = app_data_dir(app)?;
    let cursor = Cursor::new(Vec::<u8>::new());
    let mut zip = ZipWriter::new(cursor);
    let file_options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let dir_options = FileOptions::default().compression_method(zip::CompressionMethod::Stored);

    for entry in WalkDir::new(&data_dir).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if path == data_dir {
            continue;
        }
        let rel_name = zip_relative_name(&data_dir, path)?;
        if entry.file_type().is_dir() {
            zip.add_directory(format!("{}/", rel_name.trim_end_matches('/')), dir_options).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            zip.start_file(rel_name, file_options).map_err(|e| e.to_string())?;
            let mut src = fs::File::open(path).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            src.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }

    let manifest = serde_json::json!({
        "format": "seacat-note-backup-v2",
        "identifier": "com.seacat.note",
        "createdAtUnix": SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
    });
    zip.start_file("backup-manifest.json", file_options).map_err(|e| e.to_string())?;
    zip.write_all(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?;
    let cursor = zip.finish().map_err(|e| e.to_string())?;
    Ok(cursor.into_inner())
}

fn encrypt_bytes_with_password(password: &str, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let key = derive_enc_key(password, &salt)?;
    let cipher = Aes256GcmSiv::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce_bytes), plaintext).map_err(|e| e.to_string())?;
    let mut payload = nonce_bytes.to_vec();
    payload.extend_from_slice(&ciphertext);
    let envelope = BackupEnvelope {
        format: "seacat-note-backup-v2".into(),
        encrypted: true,
        salt_b64: B64.encode(salt),
        payload_b64: B64.encode(payload),
    };
    serde_json::to_vec_pretty(&envelope).map_err(|e| e.to_string())
}

fn decrypt_backup_bytes(password: &str, file_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if file_bytes.starts_with(b"PK") {
        return Ok(file_bytes.to_vec());
    }
    let envelope: BackupEnvelope = serde_json::from_slice(file_bytes).map_err(|_| "无法识别备份文件格式，或备份文件已损坏".to_string())?;
    if envelope.format != "seacat-note-backup-v2" || !envelope.encrypted {
        return Err("不支持的备份格式".into());
    }
    if password.trim().is_empty() {
        return Err("该备份已加密，请输入备份密码".into());
    }
    let salt = B64.decode(envelope.salt_b64).map_err(|e| e.to_string())?;
    let raw = B64.decode(envelope.payload_b64).map_err(|e| e.to_string())?;
    if raw.len() < 12 {
        return Err("备份内容过短".into());
    }
    let (nonce_bytes, ciphertext) = raw.split_at(12);
    let key = derive_enc_key(password, &salt)?;
    let cipher = Aes256GcmSiv::new_from_slice(&key).map_err(|e| e.to_string())?;
    cipher.decrypt(Nonce::from_slice(nonce_bytes), ciphertext).map_err(|_| "备份密码错误，或备份文件已损坏".to_string())
}

fn export_backup_inner(app: &tauri::AppHandle, output_path: &str, password: &str) -> Result<BackupExportResult, String> {
    if password.trim().len() < 4 {
        return Err("备份密码至少需要 4 位".into());
    }
    let output = PathBuf::from(output_path);
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let zip_bytes = build_backup_zip_bytes(app)?;
    let encrypted_bytes = encrypt_bytes_with_password(password, &zip_bytes)?;
    fs::write(&output, encrypted_bytes).map_err(|e| e.to_string())?;
    let file_name = output.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "seacat-note-backup.scbackup".into());
    Ok(BackupExportResult {
        file_path: output.to_string_lossy().to_string(),
        file_name,
    })
}

fn clear_directory_contents(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in WalkDir::new(src).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if path == src {
            continue;
        }
        let rel = path.strip_prefix(src).map_err(|e| e.to_string())?;
        let target = dest.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn import_backup_inner(app: &tauri::AppHandle, file_path: &str, password: &str) -> Result<(), String> {
    let file_bytes = fs::read(file_path).map_err(|e| e.to_string())?;
    let zip_bytes = decrypt_backup_bytes(password, &file_bytes)?;
    let cursor = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    let data_dir = app_data_dir(app)?;
    let parent_dir = data_dir.parent().ok_or_else(|| "无法定位应用数据目录父级".to_string())?.to_path_buf();
    let temp_dir = parent_dir.join(format!("seacat-note-import-{}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let enclosed = file.enclosed_name().ok_or_else(|| "备份包包含不安全路径".to_string())?.to_path_buf();
        if enclosed.as_os_str().is_empty() || enclosed == Path::new("backup-manifest.json") {
            continue;
        }
        let out_path = temp_dir.join(&enclosed);
        if file.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    let has_any = temp_dir.join(DB_NAME).exists()
        || temp_dir.join(APP_META_NAME).exists()
        || temp_dir.join(VAULT_DB_NAME).exists()
        || temp_dir.join(VAULT_META_NAME).exists();
    if !has_any {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("备份包中未找到 SeaCat Note 数据文件".into());
    }

    clear_directory_contents(&data_dir)?;
    copy_dir_recursive(&temp_dir, &data_dir)?;
    let _ = fs::remove_dir_all(&temp_dir);

    *app_unlocked_store().lock().map_err(|_| "app auth lock poisoned".to_string())? = false;
    *vault_key_store().lock().map_err(|_| "vault lock poisoned".to_string())? = None;
    Ok(())
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    println!("[seacat] app_data_dir = {}", dir.display());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(DB_NAME))
}

fn legacy_json_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(LEGACY_JSON))
}

fn vault_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(VAULT_DB_NAME))
}

fn vault_meta_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(VAULT_META_NAME))
}

fn app_meta_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(APP_META_NAME))
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    println!("[seacat] open_db -> {}", path.display());
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    println!("[seacat] open_db ok");
    Ok(conn)
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            parent_id TEXT NULL,
            name TEXT NOT NULL,
            sort INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            folder_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            sort INTEGER NOT NULL DEFAULT 0,
            note_type TEXT NOT NULL DEFAULT 'rich_text'
        );
        CREATE INDEX IF NOT EXISTS idx_folders_parent_sort ON folders(parent_id, sort, name);
        CREATE INDEX IF NOT EXISTS idx_notes_folder_sort ON notes(folder_id, sort, title);
        "#,
    )
    .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "ALTER TABLE notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'rich_text'",
        [],
    );
    Ok(())
}

fn open_vault_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = vault_db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    init_vault_db(&conn)?;
    Ok(conn)
}

fn init_vault_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS vault_folders (
            id TEXT PRIMARY KEY,
            parent_id TEXT NULL,
            name_enc TEXT NOT NULL,
            sort INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS vault_entries (
            id TEXT PRIMARY KEY,
            folder_id TEXT NOT NULL,
            title_enc TEXT NOT NULL,
            content_enc TEXT NOT NULL,
            entry_type TEXT NOT NULL DEFAULT 'secure_note',
            sort INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_vault_folders_parent_sort ON vault_folders(parent_id, sort);
        CREATE INDEX IF NOT EXISTS idx_vault_entries_folder_sort ON vault_entries(folder_id, sort);
        "#,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn has_any_data(conn: &Connection) -> Result<bool, String> {
    let folder_count: i64 = conn.query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let note_count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    Ok(folder_count > 0 || note_count > 0)
}

fn upsert_all(conn: &mut Connection, app_data: &AppData) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM folders", []).map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare("INSERT INTO folders (id, parent_id, name, sort) VALUES (?1, ?2, ?3, ?4)").map_err(|e| e.to_string())?;
        for f in &app_data.folders {
            stmt.execute(params![f.id, f.parent_id, f.name, f.sort]).map_err(|e| e.to_string())?;
        }
    }
    {
        let mut stmt = tx.prepare("INSERT INTO notes (id, folder_id, title, content, sort, note_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").map_err(|e| e.to_string())?;
        for n in &app_data.notes {
            stmt.execute(params![n.id, n.folder_id, n.title, n.content, n.sort, n.note_type]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

fn load_from_db(conn: &Connection) -> Result<AppData, String> {
    let mut folders_stmt = conn.prepare("SELECT id, parent_id, name, sort FROM folders ORDER BY COALESCE(parent_id, ''), sort, name").map_err(|e| e.to_string())?;
    let folders = folders_stmt.query_map([], |row| {
            Ok(Folder { id: row.get(0)?, parent_id: row.get(1)?, name: row.get(2)?, sort: row.get(3)? })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    let mut notes_stmt = conn.prepare("SELECT id, folder_id, title, content, sort, note_type FROM notes ORDER BY folder_id, sort, title").map_err(|e| e.to_string())?;
    let notes = notes_stmt.query_map([], |row| {
            Ok(Note { id: row.get(0)?, folder_id: row.get(1)?, title: row.get(2)?, content: row.get(3)?, sort: row.get(4)?, note_type: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "rich_text".into()) })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(AppData { folders, notes })
}

fn import_legacy_if_needed(app: &tauri::AppHandle, conn: &mut Connection) -> Result<(), String> {
    if has_any_data(conn)? { return Ok(()); }
    let legacy = legacy_json_path(app)?;
    if legacy.exists() {
        let text = fs::read_to_string(&legacy).map_err(|e| e.to_string())?;
        let mut data: AppData = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        for note in &mut data.notes {
            if note.note_type.is_empty() { note.note_type = "rich_text".into(); }
        }
        return upsert_all(conn, &data);
    }
    upsert_all(conn, &empty_data())
}

fn derive_enc_key(password: &str, enc_salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), enc_salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt_string(key: &[u8; 32], plaintext: &str) -> Result<String, String> {
    let cipher = Aes256GcmSiv::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| e.to_string())?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(B64.encode(combined))
}

fn decrypt_string(key: &[u8; 32], encoded: &str) -> Result<String, String> {
    let raw = B64.decode(encoded).map_err(|e| e.to_string())?;
    if raw.len() < 12 { return Err("vault payload too short".into()); }
    let (nonce_bytes, ciphertext) = raw.split_at(12);
    let cipher = Aes256GcmSiv::new_from_slice(key).map_err(|e| e.to_string())?;
    let plaintext = cipher.decrypt(Nonce::from_slice(nonce_bytes), ciphertext).map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}


fn load_app_meta(app: &tauri::AppHandle) -> Result<Option<AppAuthMeta>, String> {
    let path = app_meta_path(app)?;
    if !path.exists() { return Ok(None); }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let meta = serde_json::from_str::<AppAuthMeta>(&text).map_err(|e| e.to_string())?;
    Ok(Some(meta))
}

fn save_app_meta(app: &tauri::AppHandle, meta: &AppAuthMeta) -> Result<(), String> {
    let path = app_meta_path(app)?;
    fs::write(path, serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn load_vault_meta(app: &tauri::AppHandle) -> Result<Option<VaultMeta>, String> {
    let path = vault_meta_path(app)?;
    if !path.exists() { return Ok(None); }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let meta: VaultMeta = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(meta))
}

fn save_vault_meta(app: &tauri::AppHandle, meta: &VaultMeta) -> Result<(), String> {
    let path = vault_meta_path(app)?;
    let text = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn require_vault_key() -> Result<[u8; 32], String> {
    vault_key_store().lock().map_err(|_| "vault lock poisoned".to_string())?
        .as_ref().copied().ok_or_else(|| "保险箱尚未解锁".to_string())
}

fn save_vault_data_inner(app: &tauri::AppHandle, vault_data: &VaultData) -> Result<(), String> {
    let key = require_vault_key()?;
    let mut conn = open_vault_db(app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM vault_entries", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM vault_folders", []).map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare("INSERT INTO vault_folders (id, parent_id, name_enc, sort) VALUES (?1, ?2, ?3, ?4)").map_err(|e| e.to_string())?;
        for f in &vault_data.folders {
            let enc_name = encrypt_string(&key, &f.name)?;
            stmt.execute(params![f.id, f.parent_id, enc_name, f.sort]).map_err(|e| e.to_string())?;
        }
    }
    {
        let mut stmt = tx.prepare("INSERT INTO vault_entries (id, folder_id, title_enc, content_enc, entry_type, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").map_err(|e| e.to_string())?;
        for e in &vault_data.entries {
            let enc_title = encrypt_string(&key, &e.title)?;
            let enc_content = encrypt_string(&key, &e.content)?;
            stmt.execute(params![e.id, e.folder_id, enc_title, enc_content, e.entry_type, e.sort]).map_err(|er| er.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

fn load_vault_data_inner(app: &tauri::AppHandle) -> Result<VaultData, String> {
    let key = require_vault_key()?;
    let conn = open_vault_db(app)?;
    let mut folders_stmt = conn.prepare("SELECT id, parent_id, name_enc, sort FROM vault_folders ORDER BY COALESCE(parent_id, ''), sort").map_err(|e| e.to_string())?;
    let mut folders = Vec::new();
    let folder_rows = folders_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?, row.get::<_, i32>(3)?))
    }).map_err(|e| e.to_string())?;
    for row in folder_rows {
        let (id, parent_id, name_enc, sort) = row.map_err(|e| e.to_string())?;
        folders.push(VaultFolder { id, parent_id, name: decrypt_string(&key, &name_enc)?, sort });
    }
    let mut entries_stmt = conn.prepare("SELECT id, folder_id, title_enc, content_enc, entry_type, sort FROM vault_entries ORDER BY folder_id, sort").map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    let entry_rows = entries_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, i32>(5)?))
    }).map_err(|e| e.to_string())?;
    for row in entry_rows {
        let (id, folder_id, title_enc, content_enc, entry_type, sort) = row.map_err(|e| e.to_string())?;
        entries.push(VaultEntry { id, folder_id, title: decrypt_string(&key, &title_enc)?, content: decrypt_string(&key, &content_enc)?, entry_type, sort });
    }
    Ok(VaultData { folders, entries })
}

#[tauri::command]
fn load_app_data(app: tauri::AppHandle) -> Result<AppData, String> {
    let mut conn = open_db(&app)?;
    import_legacy_if_needed(&app, &mut conn)?;
    load_from_db(&conn)
}

#[tauri::command]
fn save_app_data(app: tauri::AppHandle, app_data: AppData) -> Result<(), String> {
    let mut conn = open_db(&app)?;
    upsert_all(&mut conn, &app_data)
}

#[tauri::command]
fn app_auth_status(app: tauri::AppHandle) -> Result<AppAuthStatus, String> {
    let initialized = load_app_meta(&app)?.is_some();
    let unlocked = *app_unlocked_store().lock().map_err(|_| "app auth lock poisoned".to_string())?;
    Ok(AppAuthStatus { initialized, unlocked })
}

#[tauri::command]
fn app_auth_initialize(app: tauri::AppHandle, password: String) -> Result<(), String> {
    println!("[seacat] app_auth_initialize start");
    if password.trim().len() < 4 { return Err("主密码至少需要 4 位".to_string()); }
    if load_app_meta(&app)?.is_some() {
        return Err("主密码已经初始化，请直接解锁".to_string());
    }
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default().hash_password(password.as_bytes(), &salt).map_err(|e| e.to_string())?.to_string();
    save_app_meta(&app, &AppAuthMeta { password_hash })?;
    *app_unlocked_store().lock().map_err(|_| "app auth lock poisoned".to_string())? = true;
    let mut conn = open_db(&app)?;
    import_legacy_if_needed(&app, &mut conn)?;
    println!("[seacat] app_auth_initialize done");
    Ok(())
}

#[tauri::command]
fn app_auth_unlock(app: tauri::AppHandle, password: String) -> Result<(), String> {
    println!("[seacat] app_auth_unlock start");
    let meta = load_app_meta(&app)?.ok_or_else(|| "尚未初始化主密码".to_string())?;
    let parsed = PasswordHash::new(&meta.password_hash).map_err(|e| e.to_string())?;
    Argon2::default().verify_password(password.as_bytes(), &parsed).map_err(|_| "主密码错误".to_string())?;
    *app_unlocked_store().lock().map_err(|_| "app auth lock poisoned".to_string())? = true;
    let mut conn = open_db(&app)?;
    import_legacy_if_needed(&app, &mut conn)?;
    println!("[seacat] app_auth_unlock done");
    Ok(())
}

#[tauri::command]
fn app_auth_lock() -> Result<(), String> {
    *app_unlocked_store().lock().map_err(|_| "app auth lock poisoned".to_string())? = false;
    Ok(())
}

#[tauri::command]
fn vault_status(app: tauri::AppHandle) -> Result<VaultStatus, String> {
    let initialized = load_vault_meta(&app)?.is_some();
    let unlocked = vault_key_store().lock().map_err(|_| "vault lock poisoned".to_string())?.is_some();
    Ok(VaultStatus { initialized, unlocked })
}

#[tauri::command]
fn vault_initialize(app: tauri::AppHandle, password: String) -> Result<(), String> {
    if password.trim().len() < 6 {
        return Err("保险箱密码至少 6 位".into());
    }
    if load_vault_meta(&app)?.is_some() {
        return Err("保险箱已经初始化".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default().hash_password(password.as_bytes(), &salt).map_err(|e| e.to_string())?.to_string();
    let mut enc_salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut enc_salt);
    let meta = VaultMeta { password_hash, enc_salt_b64: B64.encode(enc_salt) };
    save_vault_meta(&app, &meta)?;
    let key = derive_enc_key(&password, &enc_salt)?;
    *vault_key_store().lock().map_err(|_| "vault lock poisoned".to_string())? = Some(key);
    save_vault_data_inner(&app, &empty_vault())
}

#[tauri::command]
fn vault_unlock(app: tauri::AppHandle, password: String) -> Result<(), String> {
    let meta = load_vault_meta(&app)?.ok_or_else(|| "保险箱尚未初始化".to_string())?;
    let parsed = PasswordHash::new(&meta.password_hash).map_err(|e| e.to_string())?;
    Argon2::default().verify_password(password.as_bytes(), &parsed).map_err(|_| "保险箱密码错误".to_string())?;
    let enc_salt = B64.decode(meta.enc_salt_b64).map_err(|e| e.to_string())?;
    let key = derive_enc_key(&password, &enc_salt)?;
    *vault_key_store().lock().map_err(|_| "vault lock poisoned".to_string())? = Some(key);
    Ok(())
}

#[tauri::command]
fn vault_lock() -> Result<(), String> {
    *vault_key_store().lock().map_err(|_| "vault lock poisoned".to_string())? = None;
    Ok(())
}

#[tauri::command]
fn load_vault_data(app: tauri::AppHandle) -> Result<VaultData, String> {
    load_vault_data_inner(&app)
}

#[tauri::command]
fn save_vault_data(app: tauri::AppHandle, vault_data: VaultData) -> Result<(), String> {
    save_vault_data_inner(&app, &vault_data)
}


#[tauri::command]
fn export_backup(app: tauri::AppHandle, output_path: String, password: String) -> Result<BackupExportResult, String> {
    export_backup_inner(&app, &output_path, &password)
}

#[tauri::command]
fn import_backup(app: tauri::AppHandle, file_path: String, password: String) -> Result<(), String> {
    import_backup_inner(&app, &file_path, &password)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
                .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_app_data,
            app_auth_status,
            app_auth_initialize,
            app_auth_unlock,
            app_auth_lock,
            vault_status,
            vault_initialize,
            vault_unlock,
            vault_lock,
            load_vault_data,
            save_vault_data,
            export_backup,
            import_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
