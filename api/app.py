import os
from flask import Flask, render_template, request, jsonify
# 使用 Vercel 官方 SDK，不依赖底层 psycopg2 驱动
from vercel_postgres import postgres

app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

@app.route('/')
def index():
    # 只负责渲染页面，确保网页先出来
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_handler():
    # 模拟返回，确保接口通畅
    return jsonify({"success": True, "text": "基础环境已恢复，网页应正常显示"})

# 给 Vercel 识别用
app = app
