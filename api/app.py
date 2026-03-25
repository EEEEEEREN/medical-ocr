import os
from flask import Flask, render_template, jsonify

# 强制指定路径
app = Flask(__name__, template_folder='../templates', static_folder='../static')

@app.route('/')
def index():
    # 只要这个函数执行，404 就会消失
    return render_template('index.html')

@app.route('/debug')
def debug():
    # 专门用来测试后端是否活着的接口
    return jsonify({"status": "Backend is Running!", "db_url": bool(os.environ.get('POSTGRES_URL'))})

app = app
