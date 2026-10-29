"""Create the local MySQL database/user and migrate the SQLite data."""

from __future__ import annotations

import getpass
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

import mysql.connector

from app.config import get_settings

EXPECTED_TABLES = {"users", "sessions", "reset_tokens", "analyses"}


def main() -> None:
    settings = get_settings()
    if settings.db_engine != "mysql":
        raise RuntimeError("Defina VIBECHECK_DB_ENGINE=mysql antes de configurar.")
    if not settings.db_path.is_file():
        raise FileNotFoundError(f"Banco SQLite não encontrado: {settings.db_path}")
    if not re.fullmatch(r"[A-Za-z0-9_]+", settings.db_name):
        raise ValueError("VIBECHECK_DB_NAME deve conter apenas letras, números e '_'.")
    if not re.fullmatch(r"[A-Za-z0-9_]+", settings.db_user):
        raise ValueError("VIBECHECK_DB_USER deve conter apenas letras, números e '_'.")

    admin_user = input("Usuário administrador MySQL [root]: ").strip() or "root"
    admin_password = getpass.getpass("Senha do administrador MySQL: ")
    app_password = secrets.token_urlsafe(32)
    try:
        admin = mysql.connector.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=admin_user,
            password=admin_password,
        )
    except mysql.connector.Error as exc:
        if exc.errno == 1045:
            raise RuntimeError(
                f"MySQL recusou o usuário administrador {admin_user!r}. "
                "Informe um usuário administrador do MySQL (normalmente root) "
                "e a senha desse usuário — não o usuário do Windows nem a senha do app."
            ) from exc
        raise
    try:
        cursor = admin.cursor()
        cursor.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = %s",
            (settings.db_name,),
        )
        existing_tables = {row[0] for row in cursor.fetchall()}
        unexpected_tables = existing_tables - EXPECTED_TABLES
        if unexpected_tables:
            raise RuntimeError(
                f"O banco {settings.db_name!r} possui tabelas fora do VibeCheck: "
                f"{', '.join(sorted(unexpected_tables))}. Nenhum dado foi alterado."
            )

        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS `{settings.db_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        cursor.execute(f"USE `{settings.db_name}`")

        for table in sorted(existing_tables):
            cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
            if cursor.fetchone()[0]:
                raise RuntimeError(
                    f"A tabela MySQL {table!r} já contém dados. "
                    "A migração foi cancelada para evitar sobrescrever informações. "
                    "Faça backup e confira os registros antes de continuar."
                )

        cursor.execute(
            f"CREATE USER IF NOT EXISTS '{settings.db_user}'@'localhost' IDENTIFIED BY %s",
            (app_password,),
        )
        cursor.execute(
            f"ALTER USER '{settings.db_user}'@'localhost' IDENTIFIED BY %s",
            (app_password,),
        )
        cursor.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER "
            f"ON `{settings.db_name}`.* TO '{settings.db_user}'@'localhost'"
        )
        admin.commit()
    finally:
        admin.close()

    workspace_root = Path(__file__).resolve().parents[2]
    env_path = workspace_root / ".env"
    env_lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    password_line = f"VIBECHECK_DB_PASSWORD={app_password}"
    for index, line in enumerate(env_lines):
        if line.strip().startswith("VIBECHECK_DB_PASSWORD="):
            env_lines[index] = password_line
            break
    else:
        env_lines.append(password_line)
    env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    os.environ["VIBECHECK_DB_PASSWORD"] = app_password
    backend_dir = workspace_root / "backend"
    subprocess.run(
        [sys.executable, "-m", "scripts.migrate_sqlite_to_mysql"],
        cwd=backend_dir,
        env=os.environ.copy(),
        check=True,
    )
    print("MySQL configurado. A senha do usuário da aplicação foi salva apenas no .env local.")


if __name__ == "__main__":
    main()
