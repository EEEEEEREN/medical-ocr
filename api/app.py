import os
from flask import Flask, render_template, request, jsonify

# 关键：手动指定模板和静态文件路径，对齐你的 GitHub 结构
app = Flask(__name__, 
            template_folder='../templates', 
            static_folder='../static')

@app.route('/')
def index():
    # 只要能看到网页，就说明 vercel.json 通了
    return render_template('index.html')

@app.route('/ocr', methods=['POST'])
def ocr_test():
    # 临时测试接口
    return jsonify({"success": True, "text": "后端已连通，请恢复数据库代码"})

# 必须有这个 app 变量给 Vercel 调用
app = app

if __name__ == '__main__':
    app.run(debug=True)
