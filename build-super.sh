#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:$PATH"
.venv/bin/python mod/super-roster/build.py
.venv/bin/python port/web/build.py --clean
.venv/bin/python port/web/gen_data_web.py
.venv/bin/python port/web/link.py web
.venv/bin/python port/web/link.py webasync
