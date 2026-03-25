import os
import uuid
import psycopg2
from flask import Flask, render_template, request, jsonify
from vercel_blob import put

# 百度 SDK 兼容处理
try:
    from aip import AipOcr
except ImportError:
    from baidu_aip import AipOcr

from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

# 必须指定 template_folder，因为 app.py 在子目录 api/ 里
app = Flask(__name__, template_folder='../templates')

def get_db_conn():
    # 使用你环境变量里的那串 postgresql:// 链接
    return psycopg2.connect(os.environ.get('POSTGRES_URL'), sslmode='require')

@app.route('/')
def index():
    # 渲染根目录下的 templates/index.html
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    file = request.files.get('file')
    if not file: return jsonify({"success": False, "error": "未收到文件"})
    
    img_data = file.read()
    try:
        # 1. 上传图片
        new_filename = f"medical-ocr/{uuid.uuid4()}-{file.filename}"
        blob_res = put(new_filename, img_data, {"access": "public"})
        blob_url = blob_res['url']

        # 2. 识别文字
        client = AipOcr(os.environ.get('BAIDU_APP_ID'), os.environ.get('BAIDU_OCR_AK'), os.environ.get('BAIDU_OCR_SK'))
        ocr_res = client.basicGeneral(img_data)
        ocr_text = "\n".join([item['words'] for item in ocr_res.get('words_result', [])])

        # 3. 写入数据库
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ocr_records (
                id SERIAL PRIMARY KEY, 
                image_url TEXT, 
                filename TEXT, 
                result_zh TEXT, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute(
            "INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id",
            (blob_url, file.filename, ocr_text)
        )
        record_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"success": True, "text": ocr_text, "image_url": blob_url, "record_id": record_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/translate', methods=['POST'])
def translate_handler():
    data = request.get_json()
    try:
        cred = credential.Credential(os.environ.get('TENCENT_SECRET_ID'), os.environ.get('TENCENT_SECRET_KEY'))
        t_client = tmt_client.TmtClient(cred, "ap-guangzhou")
        req = models.TextTranslateRequest()
        req.SourceText = data.get('text')
        req.Source, req.Target = ("zh", "en") if data.get('target') == "en" else ("en", "zh")
        req.ProjectId = 0
        resp = t_client.TextTranslate(req)
        return jsonify({"success": True, "text": resp.TargetText})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# 确保 Vercel 识别
def handler(event, context):
    return app(event, context)

if __name__ == '__main__':
    app.run(debug=True)
