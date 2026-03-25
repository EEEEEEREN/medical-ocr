import os
import uuid
import psycopg2
from flask import Flask, render_template, request, jsonify
from vercel_blob import put

try:
    from aip import AipOcr
except ImportError:
    from baidu_aip import AipOcr

app = Flask(__name__, template_folder='../templates', static_folder='../static')

def get_db_conn():
    return psycopg2.connect(os.environ.get('POSTGRES_URL'), sslmode='require')

def init_db():
    """访问首页即自动检查并创建数据库表"""
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS ocr_records (id SERIAL PRIMARY KEY, image_url TEXT, filename TEXT, result_zh TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"DB Init Error: {e}")

@app.route('/')
def index():
    init_db()
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    # ... (保持之前的 OCR 逻辑)
    return jsonify({"success": True, "text": "后台已接通"})

app = app
