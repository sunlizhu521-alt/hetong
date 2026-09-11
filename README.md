# 合同生成

合同生成是一个部署在腾讯云服务器上的浏览器工具。用户上传订单明细和只读合同模板，手动确认字段映射后生成可编辑合同与 PDF 预览。

## 支持范围

- 订单：XLSX、XLS。
- 模板：DOCX、XLSX、XLS。
- 输出：DOCX 或 XLSX，以及对应 PDF。
- 一次上传生成一份合同。
- 临时文件在任务创建30分钟后删除。
- 不读取或内置任何真实合同模板。

## 本地开发

后端：

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
HETONG_DATA_DIR=.data .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010
```

前端：

```bash
cd frontend
pnpm install
pnpm dev
```

本机需要安装 LibreOffice 和 Poppler，才能执行 PDF 转换与预览。

## 生产部署

生产地址为 `http://129.211.9.242/hetong/`。前端由 Nginx 提供，后端只监听 `127.0.0.1:8010`。

首次部署顺序：

1. 仅清理可重建缓存和过期系统日志，确认安装前至少有6GB可用空间。
2. 执行 `deploy/scripts/bootstrap-server.sh` 安装 Python、LibreOffice、Poppler 和中文字体。
3. 仓库包含由 CI 校验过的 `frontend/dist`，执行 `deploy/scripts/apply-release.sh <commit-sha>`。
4. 将 `deploy/nginx/hetong.locations.conf` 包含到现有 IP 对应的 Nginx `server` 块内，执行 `nginx -t` 后平滑重载。
5. 检查合同页面、健康接口和服务器原有服务。

自动部署使用专用 `hetong-deploy` 用户和强制命令密钥。密钥只能调用固定部署脚本，GitHub Secrets 名称为 `DEPLOY_HOST`、`DEPLOY_KEY`。

## 安全说明

当前选择使用公网 HTTP 且不设置登录。页面会持续提示传输未加密。后端仍执行文件格式校验、大小限制、压缩包展开限制、任务令牌、IP限流、单任务转换和定时删除。
