# 墨析 · 数学竞赛批改工作台

归档时间：2026-10-18

## 运行

```bash
cp .env.example .env
# 按需填写 OPENCODE_API_KEY / SESSION_SECRET / SUPER_ADMIN_PASSWORD
npm ci
pip install -r server/requirements.txt
npm run build
npm start
```

本地地址：http://127.0.0.1:8787

## 归档说明

- 未包含 `.env`、`data/`、`node_modules/`、`dist/` 和 `bin/cloudflared`。
- 公网 Cloudflare Quick Tunnel 已停止；`bin/start-tunnel.sh` 保留，需要时可重新启动。
- 用户报告与登录用户数据不在归档中，避免泄露个人材料。
- 超级管理员与模型密钥请在部署机器的 `.env` 中重新配置。
