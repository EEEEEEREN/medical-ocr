import os
import uuid
import psycopg2
from flask import Flask, render_template, request, jsonify
from vercel_blob import put

try:
from aip import AipOcr
except ImportError:
from baidu_aip import AipOcr

from tencentcloud.common import credential
from tencentcloud.tmt.v20180321 import tmt_client, models

app = Flask(name, template_folder='../templates', static_folder='../static')

def get_db_conn():
return psycopg2.connect(os.environ.get('POSTGRES_URL'), sslmode='require')

def init_db():
try:
conn = get_db_conn()
cur = conn.cursor()
cur.execute("CREATE TABLE IF NOT EXISTS ocr_records (id SERIAL PRIMARY KEY, image_url TEXT, filename TEXT, result_zh TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
conn.commit()
cur.close()
conn.close()
except Exception as e:
print(e)

@app.route('/')
def index():
init_db()
return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
file = request.files.get('file')
img_data = file.read()
try:
new_filename = f"medical-ocr/{uuid.uuid4()}-{file.filename}"
blob_res = put(new_filename, img_data, {"access": "public"})
blob_url = blob_res['url']
client = AipOcr(os.environ.get('BAIDU_APP_ID'), os.environ.get('BAIDU_OCR_AK'), os.environ.get('BAIDU_OCR_SK'))
ocr_res = client.basicGeneral(img_data)
ocr_text = "\n".join([item['words'] for item in ocr_res.get('words_result', [])])
conn = get_db_conn()
cur = conn.cursor()
cur.execute("INSERT INTO ocr_records (image_url, filename, result_zh) VALUES (%s, %s, %s) RETURNING id", (blob_url, file.filename, ocr_text))
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
resp = t_client.TextTranslate(req)
return jsonify({"success": True, "text": resp.TargetText})
except Exception as e:
return jsonify({"success": False, "error": str(e)})

app = app
