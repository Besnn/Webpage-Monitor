"""Generate a self-signed certificate for mocksite.local."""

import os
import subprocess
import sys
import tempfile

CERTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "certs")
KEY_FILE = os.path.join(CERTS_DIR, "mocksite.key")
CERT_FILE = os.path.join(CERTS_DIR, "mocksite.crt")


def _write_temp_openssl_config() -> str:
    # Minimal config to satisfy openssl req on Windows when no default config is found.
    config = """
[ req ]
_distinguished_name = dn
x509_extensions = v3_req
prompt = no

[ dn ]
CN = mocksite.local

[ v3_req ]
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = mocksite.local
DNS.2 = localhost
""".strip()
    handle = tempfile.NamedTemporaryFile("w", delete=False, suffix=".cnf")
    handle.write(config)
    handle.flush()
    handle.close()
    return handle.name


def main():
    os.makedirs(CERTS_DIR, exist_ok=True)

    config_path = _write_temp_openssl_config()
    cmd = [
        "openssl", "req", "-x509", "-nodes", "-days", "3650",
        "-newkey", "rsa:2048",
        "-keyout", KEY_FILE,
        "-out", CERT_FILE,
        "-subj", "/CN=mocksite.local",
        "-config", config_path,
        "-extensions", "v3_req",
    ]

    print(f"Generating self-signed cert in {CERTS_DIR} ...")
    try:
        env = dict(os.environ)
        env["OPENSSL_CONF"] = config_path
        subprocess.run(cmd, check=True, env=env)
    except FileNotFoundError:
        print(
            "ERROR: openssl not found. Install OpenSSL or ensure it is on your PATH.\n"
            "  On Windows you can use the one bundled with Git:\n"
            '  set PATH=%PATH%;C:\\Program Files\\Git\\usr\\bin',
            file=sys.stderr,
        )
        sys.exit(1)
    finally:
        try:
            os.remove(config_path)
        except OSError:
            pass

    print(f"\nCertificate generated:\n  {CERT_FILE}\n  {KEY_FILE}")


if __name__ == "__main__":
    main()
