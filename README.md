# 墨析 · 数学竞赛批改工作台

面向数学竞赛（高联、CMO、IMO 等）的 AI 辅助批改 Web 应用。上传题目、整卷或手写解答（图片 / PDF），模型先按学生解答重建路线，再按评分标准逐项赋分，并把批注框叠回原手写页；报告可导出为带中文、公式和图片批注的 PDF。

若用户没有提供评分标准，系统会**在正式评分前**自动制定本题评分标准，生成一份可下载的评分标准 PDF，再进入批改。

![批改工作台](docs/preview-workbench.png)

![批改报告](docs/preview-result.png)

只写答案、未通过实质门禁的示例：[docs/sample-zero-report.pdf](docs/sample-zero-report.pdf)。

默认模型：**OpenCode Zen / `glm-5.3-flash`**，请求中启用 `thinking: {type: "enabled"}`，推理强度为 `low`（仍保留思考，但给结构化 JSON 输出留足预算）。服务端密钥通过 `.env` 的 `OPENCODE_API_KEY` 注入；未配置时仍可使用演示模式。

示例报告：[docs/sample-report.pdf](docs/sample-report.pdf)　·　评分前自动生成的评分标准：[docs/sample-rubric.pdf](docs/sample-rubric.pdf)。

## 功能

- **题目输入**：文字题目 + 最多 8 页题目图片 / PDF，支持 LaTeX、整卷与剪贴板粘贴。
- **手写解答**：最多 100 页，支持图片 / PDF、拖拽上传、鼠标悬停后 `Ctrl/Cmd+V` 粘贴截图、自动压缩、旋转、调整页序、大图预览；结果页用页码、缩略图和“当前页 / 总页数”切换多页批注。
- **答案 / 评分标准（可选）**：可粘贴官方答案、评分细则，或上传最多 12 页扫描图 / PDF；也可选择内置评分模板。
- **评分前制定标准**：未提供官方细则时，先调用模型拆解评分点、允许档位与部分分规则，生成评分标准 PDF，再开始评分；结果页可下载该 PDF。
- **统一分数档位**：按 50/40/21/7 分题、一试 16/20 分题、填空 0/8 自动约束得分；支持按题给分的整卷模式。
- **实质给分门禁**：只写答案、只有思路/框架、没有正确结论均记 0 分；只有可核验的子结论、完整方向或完整构造才给分。
- **后台批改**：提交后立即返回任务号，模型在后台完成；网页轮询任务状态，关闭页面也会继续，完成后自动进入历史报告。
- **按学生路线制定标准**：批改前不独立做题、不生成参考解；先读学生解答，按学生实际路线重建步骤并设评分点。学生路线有错时只给实际成立的实质子结论分。
- **引用定理核验**：先列出学生引用的定理/引理；不确定的自动联网搜索。搜不到或无法确认的标为 `unverified`，依赖它的评分点和后续步骤记 0；只有补出可核验证明才放行。
- **长解答逐步核验**：4 页以上或整卷必须逐页、逐个实质步骤输出 `stepAudit`；覆盖不足会要求模型重做一次，仍不足则本次不计分，并在报告中标明。
- **申诉**：报告页可提交申诉，用户可查看自己的处理进度；超级管理员在「申诉」页统一回复并标记状态。
- **CMO 严格计分**：CMO 单题固定 21 分，严格 3 分一个得分点；能力维度已从报告和 PDF 中移除。
- **AI 批改**：逐项给分、总评、亮点、改进建议、下一步练习，并输出归一化坐标的逐处批注。
- **原图批注**：彩色框叠加在手写页上，按“成立 / 错误 / 待补 / 提示”分类；框会按阅读顺序编号、自动留出笔画边距，序号放在页面左侧留白，避免压住手写字；可缩放、分页、筛选。
- **PDF 报告**：封面得分、能力维度、分项评分、逐页手写稿批注、总评与评分依据，XeLaTeX 排版。
- **评分标准库**：内置高联一试、高联二试、CMO、IMO 模板，以及 2026 高联 A 卷官方分题模板；支持新建、复制、编辑、设为默认。
- **历史报告**：保存在本机 `data/jobs`，可回溯、重新下载 PDF、删除。
- **演示模式**：无需 API Key，加载内置示例即可走完整流程并下载示例 PDF。
- **多服务商接口**：DeepSeek、智谱 BigModel、OpenCode Zen，统一 OpenAI 兼容适配层。
- **官方资料归档**：2026 高联 A 卷一试 / 加试试题、参考答案、评分标准说明已放入 `docs/references/`，并在评分标准页提供下载。

## 评分档位与题型

评分遵循用户提供的 2026 高联口径：

| 总分 | 得分点 | 允许分数 |
| ---: | ---: | --- |
| 50 | 10 分/点 | 0 / 10 / 20 / 30 / 40 / 50 |
| 40 | 10 分/点 | 0 / 10 / 20 / 30 / 40 |
| 21 | 3 分/点 | 0 / 3 / 6 / 9 / 12 / 15 / 18 / 21 |
| 7 | 1 分/点 | 0–7 的整数 |
| 一试第9题 | 4 分/点 | 0 / 4 / 8 / 12 / 16 |
| 一试第10、11题 | 5 分/点 | 0 / 5 / 10 / 15 / 20 |
| 一试填空 | 0 / 8 | 0 或 8 |

题型分为：**代数、数论、组合、几何、一试、其他**（也可选自动识别）。模型在评分前会先判断哪些结论只是平凡步骤，再按“构造 / 证明”等方向分配部分分；例如组合题只完成较简单的构造方向时，可能得到 20/50、10/40、6/21、2/7 这一量级的部分分，而不是自动给一半。

**一试整卷模式**：选择「2026 A · 一试整卷」后，系统按 8 道填空（各 8 分）+ 第9题 16 分 + 第10、11题各 20 分逐题给分，结果显示分题得分表，PDF 中使用可跨页的分题评分表。加试整卷同理（40+40+50+50=180）。

## 技术栈

- 前端：React 19 + TypeScript + Vite，KaTeX 渲染公式。
- 后端：Node.js + Express，负责模型代理、图片落盘、任务归档和 PDF 编译。
- PDF：XeLaTeX + ctex + TikZ，使用 Fandol 中文字体；批注框按归一化坐标叠加在解答图片上。PDF 上传优先由服务端 PyMuPDF 逐页渲染为 JPEG（支持中日韩 CID 字体，最多 100 页），浏览器 PDF.js 作为兜底；原始 PDF 不发送给模型。
- 存储：本地文件系统，不依赖数据库。

## 用户隔离与管理员

首次访问会进入登录 / 注册页。每个用户自行设置用户名和密码，密码以 scrypt 哈希保存在 `data/users.json`（权限 600），登录状态使用 HttpOnly 签名 Cookie，有效期 7 天。

- 普通用户只能看到、打开、下载、删除自己的报告与评分标准。
- 超级管理员通过 `.env` 的 `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` 登录，可查看所有用户的报告。
- 题目图片、解答图片、报告 PDF、评分标准 PDF、后台任务状态都做归属校验。
- 旧版本没有归属字段的历史报告只有超级管理员可见。

### 临时公网试用

```bash
./bin/start-tunnel.sh
```

终端会给出一个 `https://*.trycloudflare.com` 地址。Quick Tunnel 无需账号，但地址是临时的；进程重启后会变化。公网默认每个 IP 每小时最多 8 次批改、全局最多 4 个并发；通过 `127.0.0.1` / `localhost` 登录后不限制次数、频率和并发。

## 快速开始

```bash
npm install
pip install -r server/requirements.txt   # PDF 中文渲染需要 PyMuPDF
npm run dev
```

打开 <http://localhost:5173>。Vite 会把 `/api` 代理到 `http://127.0.0.1:8787`。

生产模式：

```bash
npm run build
npm start
# 默认 http://127.0.0.1:8787
```

### 环境要求

- Node.js 20+（本项目在 Node 22 下开发）。
- 导出 PDF 需要 **XeLaTeX**（TeX Live 2025/2026，含 `ctex`、`tcolorbox`、`tikz`、`needspace`）。如果 `xelatex` 不在 PATH 中，设置：

```bash
export TEX_BIN=/path/to/texlive/2026/bin/x86_64-linux
```

未安装 TeX 时，在线批改、批注查看仍可用，但下载 PDF 会返回明确错误。

### 密钥配置

页面「接入设置」中填写的 Key 只保存在浏览器 `localStorage`，并经本机后端转发，不写入任务文件或报告。

也可以使用服务端环境变量：

```bash
cp .env.example .env
# DEEPSEEK_API_KEY=...
# BIGMODEL_API_KEY=...
# OPENCODE_API_KEY=...
```

重启服务后生效。页面中填写的 Key 优先于环境变量。

### 内置模型（可在页面中改）

| 服务商 | Base URL | 预设模型 | 备注 |
| --- | --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash`、`deepseek-v4-pro` | `deepseek-flash` 支持图像；V4 Pro 为纯文本 |
| 智谱 BigModel | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v`、`glm-4.6v-flash`、`glm-5.3` | 视觉题请选 `glm-4.6v` 系列 |
| OpenCode Zen | `https://opencode.ai/zen/v1` | `glm-5.3-flash`、`glm-5.3`、`deepseek-v4-pro` | 默认使用 `glm-5.3-flash`，启用 thinking（high） |

服务商模型目录会变化。可在批改台「高级选项」中填写自定义模型名；新服务商只需在 `server/providers.mjs` 与 `src/lib.ts` 增加一条 provider + model 能力表。

> OpenCode Zen 的部分模型使用 Responses / Anthropic Messages 协议，不一定兼容 `chat/completions`。本应用默认只调用 OpenAI 兼容端点；如需这些模型，可在 `server/providers.mjs` 的适配层增加对应协议。

## 演示模式

首次打开默认选择「演示模式」。点击「载入一份示例」会填入一道代数最值题、示例手写解答和示例评分要点；点击「开始批改」即可查看完整报告并下载 PDF。演示报告会显著标注“演示”，不会调用外部模型。

## 评分标准

内置模板位于 `src/lib.ts` 的 `BUILTIN_RUBRICS`：

- **自动研判**：不预设分项，AI 按题目结构拆解 3–5 个评分点。
- **高联二试 · 单题**（40 分）：思路与入口 8、关键引理与结构 12、主论证与推导 14、严谨性与书写 6。
- **高联一试 · 解答题**（16 分）：思路与建模 3、运算与推导 6、结论与验证 5、书写规范 2。
- **CMO · 单题**（21 分）：总体思路 5、关键步骤 8、完成论证 6、严谨与书写 2。
- **IMO · 单题**（7 分）：策略与方向 1、关键引理 2、论证完成度 3、严谨性 1。

在「评分标准」页可以：

1. 新建标准，编辑评分项、满分与说明；
2. 复制内置标准后修改；
3. 设为默认，批改台会自动带入；
4. 与官方答案 / 评分细则图片同时使用。

批改时，评分模板会写入模型 prompt；如果上传了官方答案或评分细则，模型被要求优先遵循其中的分步给分。模型返回的 `criteria` 各项得分之和会作为报告总分，避免“总分与分项对不上”。

更详细的口径与扩展方式见 [docs/SCORING.md](docs/SCORING.md)。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查与 PDF 引擎状态 |
| GET | `/api/config` | 服务商、模型、服务端密钥状态 |
| POST | `/api/auth/register` | 注册普通用户 |
| POST | `/api/auth/login` | 登录（普通用户 / 超级管理员） |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/grade` | 提交批改；`async:true` 返回任务号，后台完成 |
| GET | `/api/tasks/:id` | 查询后台任务状态与结果 |
| POST | `/api/jobs/:id/appeal` | 提交评分申诉 |
| GET | `/api/appeals` | 查看自己的申诉（管理员查看全部） |
| PATCH | `/api/appeals/:id` | 管理员处理申诉 |
| POST | `/api/test-connection` | 测试模型连通性 |
| GET | `/api/jobs` | 历史报告列表 |
| GET | `/api/jobs/:id` | 报告详情（图片为同源 URL） |
| GET | `/api/jobs/:id/pdf` | 生成 / 下载批改报告 PDF |
| GET | `/api/rubrics/:id` | 读取自动生成的评分标准 |
| GET | `/api/rubrics/:id/pdf` | 下载评分前生成的评分标准 PDF |
| DELETE | `/api/jobs/:id` | 删除报告及图片 |
| GET | `/api/jobs/:id/image/:group/:index` | 题目 / 解答 / 评分标准图片 |

提交图片使用 data URL，单张最大 14MB；浏览器端会先压缩到最长边 1800px 的 JPEG。

## 数据与安全

- 图片、报告 JSON、PDF 缓存在 `data/jobs/<jobId>/`；自动生成的评分标准在 `data/rubrics/<rubricId>/`。
- 临时 TeX 编译目录在 `data/tmp/`，编译完成后删除。
- API Key 不进入 job 文件、报告或日志。
- 未做用户认证与多租户隔离。对外部署时请放在反向代理与登录网关之后，并限制上传体积。
- 模型会接收到题目、手写图片和评分标准；请勿上传不允许外发的材料。

## 目录结构

```
src/
  App.tsx                 应用壳与视图切换
  components/
    Workbench.tsx         上传、配置与批改流程
    ResultView.tsx        得分、批注查看、评分明细
    RubricLibrary.tsx     评分标准库与编辑器
    SettingsView.tsx      模型接入设置
    HistoryView.tsx       历史报告
  lib.ts                  内置标准、图片处理、本地存储
server/
  index.mjs               Express API
  providers.mjs           服务商适配层（OpenAI 兼容）
  grading.mjs             prompt、JSON 解析、结果归一化、演示结果
  skill-policy.mjs       按学生路线做题 / 引用核验规范
  search.mjs             Bing 联网搜索与结果解析
  render-pdf.py          PyMuPDF 服务端 PDF 逐页渲染（最多 100 页）
  appeals.mjs            申诉持久化
  rubric.mjs             评分前制定评分标准（模型 / 官方模板 / 兜底）
  rubric-pdf.mjs         评分标准 PDF 生成
  scoring.mjs            总分、得分点、档位与题型规则
  store.mjs               任务、评分标准与图片存储
  pdf.mjs                 XeLaTeX 报告生成
public/
  samples/                演示手写稿
  fonts/                  Web 用 Fandol 中文字体
docs/SCORING.md           评分口径与扩展说明
docs/references/          2026 高联 A 卷官方试题与评分文件
```

## 已知限制

- 手写识别与批注框坐标由模型估算，框位可能轻微偏移；文字批注才是主要依据。
- 视觉模型可能把连笔、符号或上下标识别错。报告明确标注“以原卷为准，建议人工复核”。
- 模型输出被要求为严格 JSON；解析失败时会自动带错误提示重试一次。若思考过程耗尽输出预算，系统会以更低思考强度和更大输出上限再试一次，仍失败时返回明确原因而不是笼统的 500。
- 当前只实现 OpenAI Chat Completions 适配；Anthropic / Responses 协议的 Zen 模型需要扩展 `providers.mjs`。
- 未提供评分标准时，系统会先调用一次模型制定标准，再调用一次模型评分；成本和耗时约为单次批改的两倍。
- 整卷模式依赖模板中的题目结构；临时拼卷需要在评分标准编辑器中准备题号与分值。
- 没有数据库与账号系统；任务目录达到一定规模后需要自行归档或接入对象存储。

## 可以继续做

- 接入 OCR 预处理，把“识读结果”展示给用户确认后再评分，进一步降低视觉模型误读。
- 增加题库与组卷：从官方试卷中自动拆题、绑定标准与题号。
- 增加教师复核模式：拖拽批注框、修改分值、二次导出。
- 把评分标准做成组织级配置（PostgreSQL / 对象存储），支持版本化。
- 增加批量批改与班级统计。
