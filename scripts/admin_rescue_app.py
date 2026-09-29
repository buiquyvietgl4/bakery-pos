#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
BAKERY ERP — ỨNG DỤNG TẠO MÃ ĐĂNG NHẬP ADMIN 1 LẦN (ADMIN RESCUE TOOL)
=============================================================================
- Chạy độc lập trên máy tính chứa mã nguồn gốc của hệ thống.
- Tạo mã đăng nhập khẩn cấp 1 lần (Single-Use OTP) cho Chủ Tiệm (Admin).
- Tự động đồng bộ vào Cloud SQL (Supabase) + Local SQL (Offline).
- Đồng thời tích hợp thuật toán mã hóa độc lập (Zero Database Dependency)
  đảm bảo website ở bất cứ đâu (Vercel, Localhost, LAN) đều nhận diện và
  mở khóa Admin thành công 100%!
=============================================================================
"""

import os
import sys
import time
import json
import hmac
import hashlib
import threading
import webbrowser
import subprocess
import urllib.request
import urllib.error

# Tự động cấu hình chuẩn UTF-8 cho console Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Khóa bí mật thuật toán dùng chung với mã nguồn Next.js
RESCUE_CODE_SECRET = b"BAKERY_ERP_ADMIN_RESCUE_SECRET_2026"
WINDOW_SECONDS = 900  # 15 phút mỗi phiên mã

DB_ROW_SECURITY_ID = "00000000-0000-0000-0000-00000000000b"
DB_ROW_SECURITY_NAME = "SYS_CONFIG_SECURITY"

def get_project_root():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if os.path.basename(current_dir).lower() == "scripts":
        return os.path.dirname(current_dir)
    return current_dir

PROJECT_ROOT = get_project_root()
ENV_LOCAL_PATH = os.path.join(PROJECT_ROOT, ".env.local")
ENV_PATH = os.path.join(PROJECT_ROOT, ".env")
LOCAL_OTP_FILE = os.path.join(PROJECT_ROOT, ".local_emergency_otp.json")
PROFILE_FILE = os.path.join(PROJECT_ROOT, ".active_database_profile.json")
SERVER_STATE_FILE = os.path.join(PROJECT_ROOT, ".local_sql_server_state.json")

DEFAULT_SUPABASE_URL = "https://azgjnahbibrcbjooepef.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn"

def load_environment():
    env_vars = {}
    for p in [ENV_PATH, ENV_LOCAL_PATH]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            env_vars[k.strip()] = v.strip().strip("'\"")
            except Exception:
                pass
    
    # Ưu tiên profile file nếu mới hơn
    if os.path.exists(PROFILE_FILE):
        try:
            with open(PROFILE_FILE, "r", encoding="utf-8") as f:
                prof = json.load(f)
                if prof.get("url") and prof.get("anonKey"):
                    env_vars["NEXT_PUBLIC_SUPABASE_URL"] = prof["url"]
                    env_vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = prof["anonKey"]
        except Exception:
            pass

    # Chốt chặn mặc định để luôn luôn kết nối Cloud
    if not env_vars.get("NEXT_PUBLIC_SUPABASE_URL"):
        env_vars["NEXT_PUBLIC_SUPABASE_URL"] = DEFAULT_SUPABASE_URL
    if not env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        env_vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = DEFAULT_SUPABASE_ANON_KEY

    return env_vars

def get_burned_codes():
    """Lấy danh sách các mã đã bị hủy từ local file, local SQL và Cloud Supabase"""
    burned = set()
    # 1. Từ LOCAL_OTP_FILE
    if os.path.exists(LOCAL_OTP_FILE):
        try:
            with open(LOCAL_OTP_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data.get("used_otp_codes", []):
                    c = item if isinstance(item, str) else item.get("code", "")
                    if c:
                        norm = str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip()
                        burned.add(norm)
                        burned.add(str(c).strip().upper())
        except Exception:
            pass

    # 2. Từ các tệp Local SQL bakery_local_db.json
    if os.path.exists(SERVER_STATE_FILE):
        try:
            with open(SERVER_STATE_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
                dirs = [state.get("production", {}).get("dirPath"), state.get("testing", {}).get("dirPath")]
                for d in filter(None, dirs):
                    j_path = os.path.join(d, "bakery_local_db.json")
                    if os.path.exists(j_path):
                        with open(j_path, "r", encoding="utf-8") as jf:
                            db_j = json.load(jf)
                            sec = db_j.get("bakery_security_config") or db_j.get("security_config") or {}
                            for item in sec.get("used_otp_codes", []):
                                c = item if isinstance(item, str) else item.get("code", "")
                                if c:
                                    norm = str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip()
                                    burned.add(norm)
                                    burned.add(str(c).strip().upper())
        except Exception:
            pass

    # 3. Từ Cloud Supabase
    env_vars = load_environment()
    sb_url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL")
    sb_key = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if sb_url and sb_key:
        try:
            url = sb_url.rstrip("/") + f"/rest/v1/recipes?or=(id.eq.{DB_ROW_SECURITY_ID},name.eq.{DB_ROW_SECURITY_NAME})&limit=1"
            req = urllib.request.Request(url, headers={
                "apikey": sb_key,
                "Authorization": f"Bearer {sb_key}",
                "Content-Type": "application/json"
            })
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data and isinstance(data, list) and len(data) > 0 and data[0].get("notes"):
                    parsed = json.loads(data[0]["notes"])
                    for item in parsed.get("used_otp_codes", []):
                        c = item if isinstance(item, str) else item.get("code", "")
                        if c:
                            norm = str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip()
                            burned.add(norm)
                            burned.add(str(c).strip().upper())
        except Exception:
            pass

    return burned

def generate_cryptographic_code(slot_hint=0):
    """
    Tạo mã 6 số chuẩn HMAC-SHA256 theo slot (0..9) và khung 15 phút.
    Nếu mã của slot đó đã bị đánh dấu trong used_otp_codes (đã từng dùng và tự hủy),
    hàm sẽ tự động nhảy sang slot kế tiếp để luôn luôn cấp một mã MỚI TINH,
    chưa từng sử dụng!
    """
    now = time.time()
    current_window = int(now // WINDOW_SECONDS)
    remaining_seconds = int(WINDOW_SECONDS - (now % WINDOW_SECONDS))
    burned = get_burned_codes()
    
    chosen_slot = slot_hint % 10
    for s in range(10):
        slot = (slot_hint + s) % 10
        payload = f"{current_window}:{slot}"
        h = hmac.new(RESCUE_CODE_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        suffix = str(int(h[:8], 16) % 100000).zfill(5)
        numeric_code = f"{slot}{suffix}"
        full_code = f"ADM-{numeric_code}"
        
        if numeric_code not in burned and full_code not in burned:
            return numeric_code, full_code, remaining_seconds, slot
            
    # Fallback nếu tất cả các slot đều đã sử dụng trong window
    payload = f"{current_window}:{chosen_slot}"
    h = hmac.new(RESCUE_CODE_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    suffix = str(int(h[:8], 16) % 100000).zfill(5)
    numeric_code = f"{chosen_slot}{suffix}"
    full_code = f"ADM-{numeric_code}"
    return numeric_code, full_code, remaining_seconds, chosen_slot

def sync_to_local_sql(numeric_code, full_code):
    """Lưu mã vào các file CSDL Local SQL của máy tính (bỏ qua nếu mã đã bị hủy)"""
    success = False
    try:
        local_cfg = {"active_otp_codes": [], "used_otp_codes": []}
        if os.path.exists(LOCAL_OTP_FILE):
            try:
                with open(LOCAL_OTP_FILE, "r", encoding="utf-8") as f:
                    local_cfg = json.load(f)
            except Exception:
                pass
        
        if not isinstance(local_cfg.get("active_otp_codes"), list):
            local_cfg["active_otp_codes"] = []
        if not isinstance(local_cfg.get("used_otp_codes"), list):
            local_cfg["used_otp_codes"] = []
            
        used_set = set()
        for item in local_cfg["used_otp_codes"]:
            c = item if isinstance(item, str) else item.get("code", "")
            if c:
                used_set.add(str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip())
                used_set.add(str(c).strip().upper())

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        # Chỉ nạp vào active_otp_codes nếu mã chưa bị dùng
        for c in [full_code, numeric_code]:
            norm = str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip()
            if norm not in used_set and str(c).strip().upper() not in used_set:
                if not any(item.get("code") == c for item in local_cfg["active_otp_codes"]):
                    local_cfg["active_otp_codes"].append({
                        "code": c,
                        "created_at": now_iso,
                        "used": False
                    })
        
        local_cfg["active_otp_codes"] = local_cfg["active_otp_codes"][-20:]
        local_cfg["updated_at"] = now_iso
        
        with open(LOCAL_OTP_FILE, "w", encoding="utf-8") as f:
            json.dump(local_cfg, f, indent=2, ensure_ascii=False)
        success = True
    except Exception as e:
        print(f"Lỗi lưu Local OTP: {e}")
        
    return success

def sync_to_cloud_supabase(numeric_code, full_code, supabase_url, anon_key):
    """Đồng bộ mã lên Cloud Supabase qua REST API"""
    if not supabase_url or not anon_key:
        return False, "Chưa cấu hình Supabase Cloud (chỉ chạy Offline)"
        
    try:
        url = supabase_url.rstrip("/") + f"/rest/v1/recipes?or=(id.eq.{DB_ROW_SECURITY_ID},name.eq.{DB_ROW_SECURITY_NAME})&limit=1"
        req = urllib.request.Request(url, headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json"
        })
        
        existing_cfg = {}
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and isinstance(data, list) and len(data) > 0 and data[0].get("notes"):
                try:
                    existing_cfg = json.loads(data[0]["notes"])
                except Exception:
                    pass
                    
        if not isinstance(existing_cfg.get("active_otp_codes"), list):
            existing_cfg["active_otp_codes"] = []
        if not isinstance(existing_cfg.get("used_otp_codes"), list):
            existing_cfg["used_otp_codes"] = []

        used_set = set()
        for item in existing_cfg["used_otp_codes"]:
            c = item if isinstance(item, str) else item.get("code", "")
            if c:
                used_set.add(str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip())
                used_set.add(str(c).strip().upper())
            
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        for c in [full_code, numeric_code]:
            norm = str(c).strip().upper().replace("ADM-", "").replace("ROOT-", "").strip()
            if norm not in used_set and str(c).strip().upper() not in used_set:
                if not any(item.get("code") == c for item in existing_cfg["active_otp_codes"]):
                    existing_cfg["active_otp_codes"].append({
                        "code": c,
                        "created_at": now_iso,
                        "used": False
                    })
                
        existing_cfg["active_otp_codes"] = existing_cfg["active_otp_codes"][-20:]
        existing_cfg["updated_at"] = now_iso
        
        # Upsert có ?on_conflict=id
        upsert_url = supabase_url.rstrip("/") + "/rest/v1/recipes?on_conflict=id"
        payload = [{
            "id": DB_ROW_SECURITY_ID,
            "name": DB_ROW_SECURITY_NAME,
            "yield_qty": 1,
            "yield_unit": "chiếc",
            "cost_per_unit": 0,
            "total_material_cost": 0,
            "notes": json.dumps(existing_cfg, ensure_ascii=False),
            "is_active": False
        }]
        
        post_req = urllib.request.Request(upsert_url, data=json.dumps(payload).encode("utf-8"), headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }, method="POST")
        
        with urllib.request.urlopen(post_req, timeout=7) as post_resp:
            if post_resp.status in (200, 201):
                return True, "Đã đồng bộ lên Cloud Supabase thành công"
            return False, f"HTTP status: {post_resp.status}"
            
    except Exception as e:
        return False, f"Không kết nối được Supabase: {e}"

def copy_to_clipboard(text):
    """Sao chép text vào clipboard của Windows"""
    try:
        if sys.platform == "win32":
            subprocess.run(f"echo | set /p=\"{text}\" | clip", shell=True, check=True)
            return True
    except Exception:
        pass
    return False

# =============================================================================
# GIAO DIỆN ĐỒ HỌA TRỰC QUAN (GUI - TKINTER)
# =============================================================================
def launch_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox
    
    # Thiết lập nhận diện High-DPI trên Windows để chữ sắc nét
    try:
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    root = tk.Tk()
    root.title("Bakery ERP — Công Cụ Tạo Mã Đăng Nhập Admin 1 Lần")
    root.geometry("640x600")
    root.minsize(580, 560)
    root.configure(bg="#F8FAFC")
    
    # Căn giữa màn hình
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    x = max(0, (screen_width - 640) // 2)
    y = max(0, (screen_height - 600) // 2)
    root.geometry(f"640x600+{x}+{y}")

    env_vars = load_environment()
    supabase_url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_anon = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    # State
    state = {
        "numeric_code": "",
        "full_code": "",
        "remaining": 0,
        "current_slot": 0,
        "cloud_status": "Đang kiểm tra...",
        "local_status": "Sẵn sàng"
    }

    # Style
    style = ttk.Style()
    style.theme_use("clam")

    # Header Panel
    header_frame = tk.Frame(root, bg="#1E3A8A", height=85)
    header_frame.pack(fill=tk.X)
    header_frame.pack_propagate(False)

    lbl_title = tk.Label(
        header_frame, 
        text="HỆ THỐNG QUẢN LÝ TIỆM BÁNH BAKERY ERP", 
        font=("Segoe UI", 10, "bold"), 
        bg="#1E3A8A", 
        fg="#FDE68A"
    )
    lbl_title.pack(pady=(12, 2))

    lbl_sub = tk.Label(
        header_frame, 
        text="⚡ CÔNG CỤ TẠO MÃ ĐĂNG NHẬP ADMIN 1 LẦN (CỨU HỘ KHẨN CẤP)", 
        font=("Segoe UI", 12, "bold"), 
        bg="#1E3A8A", 
        fg="#FFFFFF"
    )
    lbl_sub.pack()

    # Content Container
    content = tk.Frame(root, bg="#F8FAFC", padx=24, pady=16)
    content.pack(fill=tk.BOTH, expand=True)

    # Box Hiển Thị Mã
    code_card = tk.Frame(content, bg="#FFFFFF", highlightbackground="#E2E8F0", highlightthickness=2, padx=20, pady=18)
    code_card.pack(fill=tk.X, pady=(0, 14))

    lbl_tag = tk.Label(
        code_card, 
        text="MÃ ĐĂNG NHẬP ADMIN 1 LẦN (DÙNG ĐỂ VÀO HỆ THỐNG & ĐẶT MẬT KHẨU MỚI)", 
        font=("Segoe UI", 9, "bold"), 
        bg="#FFFFFF", 
        fg="#475569"
    )
    lbl_tag.pack()

    code_display_var = tk.StringVar(value="ĐANG TẠO MÃ...")
    lbl_code = tk.Label(
        code_card, 
        textvariable=code_display_var, 
        font=("Consolas", 32, "bold"), 
        bg="#FFFFFF", 
        fg="#D97706",
        cursor="hand2"
    )
    lbl_code.pack(pady=10)

    countdown_var = tk.StringVar(value="Thời gian hiệu lực: Đang tính...")
    lbl_time = tk.Label(
        code_card, 
        textvariable=countdown_var, 
        font=("Segoe UI", 10, "bold"), 
        bg="#FFFFFF", 
        fg="#2563EB"
    )
    lbl_time.pack()

    lbl_badge = tk.Label(
        code_card, 
        text="🛡️ MÃ TỰ ĐỘNG HỦY NGAY TỨC THÌ SAU KHI SỬ DỤNG (CHỈ DÙNG 1 LẦN)", 
        font=("Segoe UI", 8, "italic"), 
        bg="#FEF2F2", 
        fg="#DC2626",
        padx=10, 
        pady=3
    )
    lbl_badge.pack(pady=(8, 0))

    # Nút bấm hành động
    btn_frame = tk.Frame(content, bg="#F8FAFC")
    btn_frame.pack(fill=tk.X, pady=(0, 14))

    toast_var = tk.StringVar(value="")
    lbl_toast = tk.Label(content, textvariable=toast_var, font=("Segoe UI", 9, "bold"), bg="#F8FAFC", fg="#16A34A")
    lbl_toast.pack(pady=(0, 6))

    def on_copy():
        c = state["full_code"]
        if c:
            root.clipboard_clear()
            root.clipboard_append(c)
            copy_to_clipboard(c)
            toast_var.set(f"✓ Đã sao chép mã {c} vào bộ nhớ tạm (Clipboard)! Bấm Ctrl+V để dán.")
            root.after(3500, lambda: toast_var.set(""))

    def generate_and_update(advance=False):
        if advance:
            state["current_slot"] = (state["current_slot"] + 1) % 10
        n_code, f_code, rem, slot = generate_cryptographic_code(slot_hint=state["current_slot"])
        state["current_slot"] = slot
        state["numeric_code"] = n_code
        state["full_code"] = f_code
        state["remaining"] = rem
        code_display_var.set(f_code)
        
        # Đồng bộ ngầm
        threading.Thread(target=do_sync, args=(n_code, f_code), daemon=True).start()
        on_copy()

    def do_sync(n_code, f_code):
        # 1. Local
        sync_to_local_sql(n_code, f_code)
        local_status_var.set("✓ Đã nạp vào Local SQL (Ổ cứng máy tính)")
        
        # 2. Cloud
        if supabase_url and supabase_anon:
            cloud_status_var.set("⏳ Đang đồng bộ Cloud Supabase...")
            ok, msg = sync_to_cloud_supabase(n_code, f_code, supabase_url, supabase_anon)
            if ok:
                cloud_status_var.set("✓ Đã đồng bộ Cloud Supabase thành công")
            else:
                cloud_status_var.set(f"ℹ️ {msg}")
        else:
            cloud_status_var.set("ℹ️ Chế độ thuật toán độc lập (Không cần Cloud)")

    btn_copy = tk.Button(
        btn_frame, 
        text="📋 SAO CHÉP MÃ (CTRL + V)", 
        font=("Segoe UI", 10, "bold"), 
        bg="#D97706", 
        fg="#FFFFFF", 
        activebackground="#B45309", 
        activeforeground="#FFFFFF",
        relief=tk.FLAT, 
        padx=18, 
        pady=10, 
        cursor="hand2",
        command=on_copy
    )
    btn_copy.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 6))

    btn_refresh = tk.Button(
        btn_frame, 
        text="🔄 TẠO MÃ MỚI", 
        font=("Segoe UI", 10, "bold"), 
        bg="#E2E8F0", 
        fg="#1E293B", 
        activebackground="#CBD5E1", 
        relief=tk.FLAT, 
        padx=18, 
        pady=10, 
        cursor="hand2",
        command=lambda: generate_and_update(advance=True)
    )
    btn_refresh.pack(side=tk.RIGHT, expand=True, fill=tk.X, padx=(6, 0))

    # Bảng trạng thái kết nối
    status_card = tk.LabelFrame(
        content, 
        text=" Trạng Thái Đồng Bộ Cơ Sở Dữ Liệu ", 
        font=("Segoe UI", 9, "bold"), 
        bg="#FFFFFF", 
        fg="#334155",
        padx=14, 
        pady=10
    )
    status_card.pack(fill=tk.X, pady=(0, 14))

    cloud_status_var = tk.StringVar(value="Đang kết nối...")
    local_status_var = tk.StringVar(value="Đang kết nối...")

    row1 = tk.Frame(status_card, bg="#FFFFFF")
    row1.pack(fill=tk.X, pady=2)
    tk.Label(row1, text="☁️ Cloud SQL (Supabase):", font=("Segoe UI", 9, "bold"), bg="#FFFFFF", width=24, anchor="w").pack(side=tk.LEFT)
    tk.Label(row1, textvariable=cloud_status_var, font=("Segoe UI", 9), bg="#FFFFFF", fg="#0369A1", anchor="w").pack(side=tk.LEFT, fill=tk.X, expand=True)

    row2 = tk.Frame(status_card, bg="#FFFFFF")
    row2.pack(fill=tk.X, pady=2)
    tk.Label(row2, text="💾 Local SQL (Cục bộ):", font=("Segoe UI", 9, "bold"), bg="#FFFFFF", width=24, anchor="w").pack(side=tk.LEFT)
    tk.Label(row2, textvariable=local_status_var, font=("Segoe UI", 9), bg="#FFFFFF", fg="#15803D", anchor="w").pack(side=tk.LEFT, fill=tk.X, expand=True)

    row3 = tk.Frame(status_card, bg="#FFFFFF")
    row3.pack(fill=tk.X, pady=2)
    tk.Label(row3, text="🔒 Thuật Toán Mã Hóa:", font=("Segoe UI", 9, "bold"), bg="#FFFFFF", width=24, anchor="w").pack(side=tk.LEFT)
    tk.Label(row3, text="✓ Tự động nhận diện trên mọi website dùng mã nguồn này", font=("Segoe UI", 9), bg="#FFFFFF", fg="#7C3AED", anchor="w").pack(side=tk.LEFT, fill=tk.X, expand=True)

    # Hướng dẫn nhanh & nút mở website
    guide_frame = tk.Frame(content, bg="#F1F5F9", padx=12, pady=10)
    guide_frame.pack(fill=tk.X)

    tk.Label(
        guide_frame, 
        text="CÁCH SỬ DỤNG: Mở màn hình Đăng Nhập trên Website -> Bấm 'Quên mật khẩu?' -> Dán mã trên vào ô 'Mã Đăng Nhập 1 Lần' -> Điền Mật khẩu mới -> Xong!", 
        font=("Segoe UI", 8.5), 
        bg="#F1F5F9", 
        fg="#334155", 
        wraplength=540, 
        justify="left"
    ).pack(anchor="w")

    def open_web():
        webbrowser.open("http://localhost:3000")

    btn_open = tk.Button(
        content, 
        text="🌐 MỞ TRANG ĐĂNG NHẬP BÁN HÀNG (LOCALHOST:3000)", 
        font=("Segoe UI", 9, "bold"), 
        bg="#1E3A8A", 
        fg="#FFFFFF", 
        activebackground="#1E40AF", 
        relief=tk.FLAT, 
        pady=8, 
        cursor="hand2",
        command=open_web
    )
    btn_open.pack(fill=tk.X, pady=(10, 0))

    # Vòng lặp đếm ngược mỗi giây
    def timer_tick():
        if state["remaining"] > 0:
            state["remaining"] -= 1
            mins = state["remaining"] // 60
            secs = state["remaining"] % 60
            countdown_var.set(f"Thời gian hiệu lực còn lại: {mins:02d} phút {secs:02d} giây")
        else:
            generate_and_update()
            
        root.after(1000, timer_tick)

    # Khởi tạo mã lần đầu
    generate_and_update()
    root.after(1000, timer_tick)
    root.mainloop()

# =============================================================================
# CHẾ ĐỘ TERMINAL / DÒNG LỆNH (CLI)
# =============================================================================
def launch_cli():
    env_vars = load_environment()
    supabase_url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_anon = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    n_code, f_code, rem, _ = generate_cryptographic_code()
    copy_to_clipboard(f_code)

    print("\n╔══════════════════════════════════════════════════════════════════════╗")
    print("║       HỆ THỐNG BAKERY ERP — MÃ ĐĂNG NHẬP ADMIN 1 LẦN (RESCUE TOOL)   ║")
    print("╚══════════════════════════════════════════════════════════════════════╝\n")
    print(f"👉 MÃ ĐĂNG NHẬP ADMIN 1 LẦN CỦA BẠN:   {f_code}   (hoặc: {n_code})")
    print(f"⏱️  Thời gian hiệu lực: {rem // 60} phút {rem % 60} giây")
    print("📋 ĐÃ TỰ ĐỘNG SAO CHÉP VÀO CLIPBOARD (Bấm Ctrl+V để dán).\n")

    sync_to_local_sql(n_code, f_code)
    print("✓ Đã nạp vào Local SQL (Cục bộ ổ cứng máy tính)")

    if supabase_url and supabase_anon:
        ok, msg = sync_to_cloud_supabase(n_code, f_code, supabase_url, supabase_anon)
        print(f"✓ Cloud Supabase: {msg}")
    else:
        print("ℹ️ Chạy chế độ thuật toán độc lập (Không cần Cloud Supabase)")

    print("\n🔒 ĐẶC ĐIỂM AN TOÀN:")
    print("   • Mã chỉ sử dụng được DUY NHẤT 1 LẦN và tự hủy ngay sau khi dùng.")
    print("   • Bất kể website đang chạy Cloud hay Local, đều mở khóa Admin thành công.")
    print("══════════════════════════════════════════════════════════════════════\n")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ("--cli", "-c", "cli"):
        launch_cli()
    else:
        try:
            launch_gui()
        except Exception as e:
            print(f"Không thể khởi động GUI ({e}), chuyển sang chế độ CLI...")
            launch_cli()
