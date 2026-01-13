import os
import re
import json
import time
import shutil
import subprocess
import threading
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Drag & drop (optional): pip install tkinterdnd2
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore
    DND_AVAILABLE = True
except Exception:
    DND_AVAILABLE = False

APP_NAME = "傻瓜式 GitHub 备份工具（自动建仓库 + 推送）"
CFG_PATH = Path(os.environ.get("APPDATA", str(Path.home()))) / "github_backup_gui_easy_config.json"

# 常见忽略（你可以按需删改）
DEFAULT_GITIGNORE = r"""
# system
.DS_Store
Thumbs.db

# logs/temp
*.log
*.tmp
*.bak

# secrets
.env
.env.*
*.pem
*.key

# python
__pycache__/
*.pyc
.venv/
venv/

# node
node_modules/
**/node_modules/

# build
dist/
build/
out/
.coverage/
.cache/
.next/
.turbo/

# media/archives (often huge)
*.mp3
*.mp4
*.mov
*.zip
*.7z
*.rar

# db (optional)
*.db
"""

def run(cmd, cwd: Path | None = None):
    p = subprocess.run(
        cmd, cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, shell=False
    )
    return p.returncode, p.stdout, p.stderr

def which_ok(name: str) -> bool:
    return shutil.which(name) is not None

def normalize_repo_name(name: str) -> str:
    # GitHub repo name: allow letters, numbers, ., -, _
    name = name.strip()
    name = name.replace(" ", "-")
    name = re.sub(r"[^\w\.\-]+", "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    return name[:90] if name else "backup-repo"

def detect_gh_login() -> str | None:
    if not which_ok("gh"):
        return None
    # gh api user --jq .login
    code, out, err = run(["gh", "api", "user", "--jq", ".login"])
    if code == 0:
        login = out.strip()
        return login if login else None
    return None

def gh_auth_ok() -> bool:
    if not which_ok("gh"):
        return False
    code, out, err = run(["gh", "auth", "status"])
    return code == 0

def ensure_gitignore(repo: Path):
    gi = repo / ".gitignore"
    if not gi.exists():
        gi.write_text(DEFAULT_GITIGNORE.strip() + "\n", encoding="utf-8")
        return
    existing = gi.read_text(encoding="utf-8", errors="ignore")
    # append missing lines
    add_lines = []
    for line in DEFAULT_GITIGNORE.strip().splitlines():
        line = line.rstrip()
        if line and line not in existing:
            add_lines.append(line)
    if add_lines:
        with gi.open("a", encoding="utf-8") as f:
            f.write("\n" + "\n".join(add_lines) + "\n")

def list_big_files(repo: Path, threshold_mb: int):
    threshold = threshold_mb * 1024 * 1024
    big = []
    for p in repo.rglob("*"):
        if not p.is_file():
            continue
        if ".git" in p.parts:
            continue
        try:
            sz = p.stat().st_size
        except Exception:
            continue
        if sz >= threshold:
            big.append((p, sz))
    big.sort(key=lambda x: -x[1])
    return big

def add_to_gitignore(repo: Path, paths: list[str]):
    gi = repo / ".gitignore"
    existing = gi.read_text(encoding="utf-8", errors="ignore") if gi.exists() else ""
    with gi.open("a", encoding="utf-8") as f:
        for rel in paths:
            if rel not in existing:
                f.write(rel.replace("\\", "/") + "\n")

def find_git_filter_repo_exe() -> str | None:
    # 1) if in PATH
    p = shutil.which("git-filter-repo")
    if p:
        return p
    # 2) common pip --user location
    appdata = Path(os.environ.get("APPDATA", ""))
    candidates = []
    if appdata.exists():
        for pyver in ["Python312", "Python311", "Python310", "Python39", "Python38"]:
            cand = appdata / "Python" / pyver / "Scripts" / "git-filter-repo.exe"
            candidates.append(cand)
    # 3) also try roaming python Scripts wildcard
    for c in candidates:
        if c.exists():
            return str(c)
    return None

def filter_repo_remove_paths(repo: Path, paths: list[str], log_cb):
    exe = find_git_filter_repo_exe()
    if not exe:
        raise RuntimeError("检测到大文件在历史中需要清理，但找不到 git-filter-repo。请先安装：python -m pip install --user git-filter-repo")
    cmd = [exe, "--force"]
    for rel in paths:
        cmd += ["--path", rel.replace("\\", "/")]
    cmd += ["--invert-paths"]
    log_cb(f"执行历史清理（git-filter-repo）移除路径：{len(paths)} 个\n")
    code, out, err = run(cmd, cwd=repo)
    log_cb(out + err)
    if code != 0:
        raise RuntimeError("git-filter-repo 清理失败。")

class BackupGUI:
    def __init__(self, root):
        self.root = root
        self.root.title(APP_NAME)
        self.root.geometry("900x620")
        self.root.minsize(900, 620)

        self.repo_dir = tk.StringVar()
        self.repo_name = tk.StringVar()
        self.owner = tk.StringVar()
        self.commit_msg = tk.StringVar(value="backup: update")

        self.private_repo = tk.BooleanVar(value=False)  # default public
        self.auto_purge_big = tk.BooleanVar(value=True)
        self.big_threshold = tk.IntVar(value=100)

        self._load()
        self._ui()

    def _ui(self):
        frm = ttk.Frame(self.root, padding=10)
        frm.pack(fill="both", expand=True)

        ttk.Label(frm, text="傻瓜式 GitHub 备份：自动建仓库 + 自动推送（SSH）", font=("Segoe UI", 16, "bold")).grid(
            row=0, column=0, columnspan=4, sticky="w", pady=(0, 8)
        )

        ttk.Label(frm, text="要备份的文件夹：").grid(row=1, column=0, sticky="w")
        self.repo_entry = ttk.Entry(frm, textvariable=self.repo_dir)
        self.repo_entry.grid(row=1, column=1, columnspan=2, sticky="we", padx=(6, 6))
        ttk.Button(frm, text="选择…", command=self.pick_folder).grid(row=1, column=3, sticky="e")

        hint = "（可拖拽文件夹到输入框）" if DND_AVAILABLE else "（拖拽功能可选：pip install tkinterdnd2）"
        ttk.Label(frm, text=hint, foreground="#666").grid(row=2, column=1, columnspan=3, sticky="w")

        ttk.Label(frm, text="GitHub 账号（自动识别）：").grid(row=3, column=0, sticky="w", pady=(10, 0))
        ttk.Entry(frm, textvariable=self.owner).grid(row=3, column=1, sticky="we", padx=(6, 6), pady=(10, 0))
        ttk.Button(frm, text="检测账号", command=self.detect_account).grid(row=3, column=3, sticky="e", pady=(10, 0))

        ttk.Label(frm, text="仓库名（默认=文件夹名）：").grid(row=4, column=0, sticky="w", pady=(10, 0))
        ttk.Entry(frm, textvariable=self.repo_name).grid(row=4, column=1, columnspan=3, sticky="we", padx=(6, 0), pady=(10, 0))

        ttk.Label(frm, text="提交信息：").grid(row=5, column=0, sticky="w", pady=(10, 0))
        ttk.Entry(frm, textvariable=self.commit_msg).grid(row=5, column=1, columnspan=3, sticky="we", padx=(6, 0), pady=(10, 0))

        opt = ttk.Frame(frm)
        opt.grid(row=6, column=0, columnspan=4, sticky="we", pady=(10, 0))
        ttk.Checkbutton(opt, text="创建为私有仓库（不勾选=公开）", variable=self.private_repo).pack(anchor="w")
        ttk.Checkbutton(opt, text="自动彻底清理 >阈值MB 的大文件（推荐勾选，避免 GH001 拒绝）", variable=self.auto_purge_big).pack(anchor="w")
        ttk.Label(opt, text="大文件阈值（MB，GitHub限制是100MB）：").pack(anchor="w", pady=(6, 0))
        ttk.Spinbox(opt, from_=50, to=1024, textvariable=self.big_threshold, width=8).pack(anchor="w")

        btns = ttk.Frame(frm)
        btns.grid(row=7, column=0, columnspan=4, sticky="we", pady=(12, 0))
        self.btn_backup = ttk.Button(btns, text="🚀 一键备份（自动建仓库+推送）", command=self.start_backup)
        self.btn_backup.pack(side="left")
        ttk.Button(btns, text="保存设置", command=self.save).pack(side="left", padx=(8, 0))
        ttk.Button(btns, text="清空日志", command=self.clear_log).pack(side="left", padx=(8, 0))

        ttk.Label(frm, text="日志：").grid(row=8, column=0, sticky="w", pady=(12, 0))
        self.log = tk.Text(frm, height=20, wrap="word")
        self.log.grid(row=9, column=0, columnspan=4, sticky="nsew", pady=(6, 0))
        self.log.configure(state="disabled")

        sb = ttk.Scrollbar(frm, command=self.log.yview)
        sb.grid(row=9, column=4, sticky="ns")
        self.log["yscrollcommand"] = sb.set

        frm.columnconfigure(1, weight=1)
        frm.columnconfigure(3, weight=1)
        frm.rowconfigure(9, weight=1)

        if DND_AVAILABLE:
            self.repo_entry.drop_target_register(DND_FILES)
            self.repo_entry.dnd_bind("<<Drop>>", self._on_drop)

        self.append_log("启动成功。\n")
        if not which_ok("gh"):
            self.append_log("⚠️ 检测不到 gh（GitHub CLI）。建议安装后再用“一键建仓库”功能：gh auth login\n")
        else:
            if gh_auth_ok():
                self.append_log("✅ gh 已安装，且已登录。\n")
            else:
                self.append_log("⚠️ gh 已安装，但似乎未登录。请先运行：gh auth login\n")

        if not self.owner.get().strip():
            self.detect_account(silent=True)

    def _on_drop(self, event):
        p = event.data.strip()
        if p.startswith("{") and p.endswith("}"):
            p = p[1:-1]
        p = p.strip('"')
        if os.path.isdir(p):
            self.repo_dir.set(p)
            self.auto_fill_repo_name()
            self.append_log(f"已拖入文件夹：{p}\n")

    def pick_folder(self):
        p = filedialog.askdirectory()
        if p:
            self.repo_dir.set(p)
            self.auto_fill_repo_name()
            self.append_log(f"已选择文件夹：{p}\n")

    def auto_fill_repo_name(self):
        p = self.repo_dir.get().strip()
        if not p:
            return
        folder = Path(p).name
        if not self.repo_name.get().strip():
            self.repo_name.set(normalize_repo_name(folder))

    def append_log(self, s: str):
        self.log.configure(state="normal")
        self.log.insert("end", s)
        self.log.see("end")
        self.log.configure(state="disabled")
        self.root.update_idletasks()

    def clear_log(self):
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")

    def detect_account(self, silent=False):
        login = detect_gh_login()
        if login:
            self.owner.set(login)
            if not silent:
                messagebox.showinfo(APP_NAME, f"检测到 GitHub 登录账号：{login}")
            self.append_log(f"✅ 检测到 GitHub 账号：{login}\n")
        else:
            if not silent:
                messagebox.showwarning(APP_NAME, "未能自动检测账号。\n请确保已安装 gh 并运行 gh auth login。")
            self.append_log("⚠️ 未能自动检测 GitHub 账号（gh 未安装或未登录）。\n")

    def _load(self):
        if CFG_PATH.exists():
            try:
                cfg = json.loads(CFG_PATH.read_text(encoding="utf-8"))
                self.repo_dir.set(cfg.get("repo_dir", ""))
                self.repo_name.set(cfg.get("repo_name", ""))
                self.owner.set(cfg.get("owner", ""))
                self.commit_msg.set(cfg.get("commit_msg", "backup: update"))
                self.private_repo.set(bool(cfg.get("private_repo", False)))
                self.auto_purge_big.set(bool(cfg.get("auto_purge_big", True)))
                self.big_threshold.set(int(cfg.get("big_threshold", 100)))
            except Exception:
                pass

    def save(self):
        cfg = {
            "repo_dir": self.repo_dir.get().strip(),
            "repo_name": self.repo_name.get().strip(),
            "owner": self.owner.get().strip(),
            "commit_msg": self.commit_msg.get().strip(),
            "private_repo": bool(self.private_repo.get()),
            "auto_purge_big": bool(self.auto_purge_big.get()),
            "big_threshold": int(self.big_threshold.get()),
        }
        CFG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CFG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        messagebox.showinfo(APP_NAME, f"已保存设置：\n{CFG_PATH}")

    def start_backup(self):
        repo = Path(self.repo_dir.get().strip())
        owner = self.owner.get().strip()
        repo_name = self.repo_name.get().strip()
        msg = self.commit_msg.get().strip() or f"backup: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        threshold = int(self.big_threshold.get())

        if not repo.exists() or not repo.is_dir():
            messagebox.showerror(APP_NAME, "请选择有效文件夹。")
            return
        if not owner:
            messagebox.showerror(APP_NAME, "GitHub 账号为空。点“检测账号”或先 gh auth login。")
            return
        if not repo_name:
            repo_name = normalize_repo_name(repo.name)
            self.repo_name.set(repo_name)

        self.btn_backup.configure(state="disabled")
        self.append_log("\n========== 开始一键备份 ==========\n")
        th = threading.Thread(target=self._backup_thread, args=(repo, owner, repo_name, msg, threshold), daemon=True)
        th.start()

    def _backup_thread(self, repo: Path, owner: str, repo_name: str, msg: str, threshold: int):
        try:
            self._do_backup(repo, owner, repo_name, msg, threshold)
            self.append_log("\n✅ 全部完成：你现在去 GitHub 仓库页面刷新就能看到最新备份。\n")
        except Exception as e:
            self.append_log(f"\n❌ 失败：{e}\n")
            messagebox.showerror(APP_NAME, str(e))
        finally:
            self.btn_backup.configure(state="normal")

    def _do_backup(self, repo: Path, owner: str, repo_name: str, msg: str, threshold: int):
        if not which_ok("git"):
            raise RuntimeError("找不到 git。请安装 Git for Windows，并确保 git 在 PATH。")

        # 0) ensure .gitignore
        ensure_gitignore(repo)

        # 1) init repo if needed
        if not (repo / ".git").exists():
            self.append_log("不是 Git 仓库：git init\n")
            code, out, err = run(["git", "init"], cwd=repo)
            self.append_log(out + err)
            if code != 0:
                raise RuntimeError("git init 失败。")
            run(["git", "branch", "-M", "main"], cwd=repo)

        # 2) set branch main
        run(["git", "branch", "-M", "main"], cwd=repo)

        # 3) detect big files (> threshold)
        big = list_big_files(repo, threshold)
        if big:
            self.append_log(f"⚠️ 发现 >= {threshold}MB 大文件（GitHub 会拒绝）：\n")
            rels = []
            for p, sz in big[:30]:
                rel = str(p.relative_to(repo)).replace("\\", "/")
                rels.append(rel)
                self.append_log(f"  - {rel} ({sz/1024/1024:.2f} MB)\n")
            if len(big) > 30:
                self.append_log(f"  ... 还有 {len(big)-30} 个未显示\n")

            add_to_gitignore(repo, rels)
            self.append_log("已把这些大文件追加进 .gitignore（以后不会再被提交）\n")

            if self.auto_purge_big.get():
                self.append_log("已开启“彻底清理历史”：会用 git-filter-repo 从历史中删除这些大文件（推荐）\n")
                # git-filter-repo 会移除 origin，需要后面重新加
                filter_repo_remove_paths(repo, rels, self.append_log)
            else:
                raise RuntimeError("检测到大文件。请勾选“自动彻底清理”或手动移除后再备份。")

        # 4) create GitHub repo if needed (via gh)
        if which_ok("gh"):
            if not gh_auth_ok():
                raise RuntimeError("gh 未登录。请先运行：gh auth login")
            full = f"{owner}/{repo_name}"
            vis = "--private" if self.private_repo.get() else "--public"

            self.append_log(f"确保 GitHub 仓库存在：{full}\n")
            # if already exists, create will fail; ignore that
            code, out, err = run(["gh", "repo", "create", full, vis, "--confirm"])
            # When exists, gh returns non-zero with message; we won't hard fail
            self.append_log(out + err)
        else:
            self.append_log("⚠️ 没有 gh：跳过自动建仓库（请你先在网页手动建空仓库）。\n")

        # 5) ensure remote origin (SSH)
        remote_url = f"git@github.com:{owner}/{repo_name}.git"
        code, out, err = run(["git", "remote"], cwd=repo)
        remotes = out.split()
        if "origin" in remotes:
            self.append_log(f"设置 origin：{remote_url}\n")
            run(["git", "remote", "set-url", "origin", remote_url], cwd=repo)
        else:
            self.append_log(f"添加 origin：{remote_url}\n")
            run(["git", "remote", "add", "origin", remote_url], cwd=repo)

        # 6) stage & commit
        self.append_log("git add -A\n")
        run(["git", "add", "-A"], cwd=repo)

        code, out, err = run(["git", "status", "--porcelain"], cwd=repo)
        if out.strip():
            self.append_log(f"git commit -m \"{msg}\"\n")
            code, out2, err2 = run(["git", "commit", "-m", msg], cwd=repo)
            self.append_log(out2 + err2)
            if code != 0:
                # common: user.name/email not set
                self.append_log("提示：如果提示缺少 user.name/user.email，可执行：\n"
                                "  git config --global user.name \"YourName\"\n"
                                "  git config --global user.email \"you@example.com\"\n")
        else:
            self.append_log("没有改动可提交（working tree clean），直接推送。\n")

        # 7) push
        self.append_log("git push -u origin main\n")
        code, out, err = run(["git", "push", "-u", "origin", "main"], cwd=repo)
        self.append_log(out + err)
        if code != 0:
            raise RuntimeError("git push 失败。看日志里错误信息（常见：SSH/仓库权限/网络）。")

        # 8) final
        code, out, err = run(["git", "log", "-1", "--oneline"], cwd=repo)
        if code == 0:
            self.append_log(f"✅ 最新提交：{out.strip()}\n")

def main():
    root = TkinterDnD.Tk() if DND_AVAILABLE else tk.Tk()
    app = BackupGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
