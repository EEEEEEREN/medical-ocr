import os
import uuid
import psycopg2
from flask import Flask, render_template, request, jsonify
from vercel_blob import put

# 百度 SDK 兼容性引入
try:
    from aip import AipOcr
except ImportError:
    from baidu_aip import AipOcr

from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

# 重要：因为 app.py 在 api/ 文件夹下，必须告诉 Flask 模板在上一级
app = Flask(__name__, template_folder='../templates')

# --- 1. 数据库连接函数 ---
def get_db_conn():
    """使用 psycopg2 连接 Vercel Postgres (Neon)"""
    # 确保环境变量中有 POSTGRES_URL
    conn_url = os.environ.get('POSTGRES_URL')
    if not conn_url:
        raise Exception("环境变量 POSTGRES_URL 未找到")
    return psycopg2.connect(conn_url, sslmode='require')

def ensure_table_exists():
    """初始化数据库表结构"""
    conn = get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ocr_records (
                id SERIAL PRIMARY KEY,
                image_url TEXT,
                filename TEXT,
                result_zh TEXT,
                result_en TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cur.close()
    finally:
        conn.close()

# --- 2. 路由处理 ---

@app.route('/')
def index():
    """主页路由"""
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    """处理图片上传、OCR 识别并存入数据库"""
    file = request.files.get('file')
    if not file:
        return jsonify({"success": False, "error": "未收到文件"})
    
    img_data = file.read()
    filename = file.filename

    try:
        # A. 上传图片到 Vercel Blob
        new_filename = f"medical-ocr/{uuid.uuid4()}-{filename}"
        blob_res = put(new_filename, img_data, {"access": "public"})
        blob_url = blob_res['url']

        # B. 调用百度 OCR
        client = AipOcr(
            os.environ.get('BAIDU_APP_ID'),
            os.environ.get('BAIDU_OCR_AK'),
            os.environ.get('BAIDU_OCR_SK')
        )
        ocr_res = client.basicGeneral(img_data)
        if 'error_msg' in ocr_res:
            return jsonify({"success": False, "error": f"百度OCR错误: {ocr_res['error_msg']}"})
            
        lines = [item['words'] for item in ocr_res.get('words_result', [])]
        ocr_text = "\n".join(lines)

        # C. 存入数据库
        ensure_table_exists()
        conn = get_db_conn()
        record_id = None
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
                (blob_url, filename, ocr_text)
            )
            record_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
        finally:
            conn.close()

        return jsonify({
            "success": True, 
            "text": ocr_text, 
            "image_url": blob_url, 
            "record_id": record_id
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"服务器内部错误: {str(e)}"})

@app.route('/translate', methods=['POST'])
def translate_handler():
    """调用腾讯翻译并更新数据库记录"""
    data = request.get_json()
    text = data.get('text')
    record_id = data.get('record_id')
    target = data.get('target', 'en')

    try:
        # 腾讯翻译初始化
        cred = credential.Credential(
            os.environ.get('TENCENT_SECRET_ID'),
            os.environ.get('TENCENT_SECRET_KEY')
        )
        t_client = tmt_client.TmtClient(cred, "ap-guangzhou")
        
        req = models.TextTranslateRequest()
        req.SourceText = text
        req.Source = "zh" if target == "en" else "en"
        req.Target = target
        req.ProjectId = 0

        resp = t_client.TextTranslate(req)
        trans_text = resp.TargetText

        # 如果有记录ID，更新数据库
        if record_id:
            conn = get_db_conn()
            try:
                cur = conn.cursor()
                # 根据目标语言选择更新的字段
                field = "result_en" if target == "en" else "result_zh"
                cur.execute(f"UPDATE ocr_records SET {field} = %s WHERE id = %s", (trans_text, record_id))
                conn.commit()
                cur.close()
            finally:
                conn.close()

        return jsonify({"success": True, "text": trans_text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == '__main__':
    # 本地测试模式
    app.run(debug=True)
