这是一套Saas多商户点餐小程序的开发规则，请在开发时严格遵守。
#技术栈：
后端采用node.js+NestJS11稳定版本，数据库使用MySQL+rides，前端Vue 3.5 + TypeScript + Vite + Pinia + Vue Router + VueUse + Element Plus，数据层加 TanStack Vue Query。
禁止在后端文件中写SQL语句
平台前端管理界面admin-web采用vue3
商家端MH-web采用vue3
小程序使用HBuilderX开发，采用uni-appX，紧张修改HBuilderX创建的项目结构,开发小程序必须严格按照D:\Myproject\Ye-DC点餐小程序UI设计规范.md
前端项目不需要env配置，前端项目视为生产环境，开发前端项目时按照生产安全级别开发。（很重要）
前后端项目结构必须清晰好维护（很重要）
支付模块必须严格按照生产来开发（重中之重），所有订单金额计算必须走后端计算。
后端文件Api-Serve必须使用.env文件，env配置如下：
# ==========================================
# 1. 环境基础配置
# ==========================================
# 环境标识：开发环境填 'development'，生产环境填 'production'
APP_ENV=development
#APP_ENV=production

# 应用调试模式：生产环境务必设为 False，开发环境可设为 True
DEBUG=True

# 应用监听端口
APP_PORT=8000

# 允许访问的域名/IP列表 (CORS 配置)
# 开发环境通常填前端本地地址，如 http://localhost:5173
# 生产环境填正式域名，如 https://<PRODUCTION_DOMAIN>
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# 允许的 Host 列表 (防止 Host 头攻击)
ALLOWED_HOSTS=<ALLOWED_HOSTS>

# ==========================================
# 2. 数据库配置 (MySQL)
# ==========================================
# 数据库主机地址
DB_HOST=127.0.0.1
# 数据库端口
DB_PORT=3306
# 数据库用户名
DB_USER=root
# 数据库密码
DB_PASSWORD=12345
# 数据库名称
DB_NAME=APi-Serve
# 数据库连接池大小
DB_POOL_SIZE=5


# ==========================================
# 3. 缓存配置 (Redis)
# ==========================================
# Redis 主机地址
REDIS_HOST=127.0.0.1
# Redis 端口
REDIS_PORT=6379
# Redis 密码 (如果没有则留空)
REDIS_PASSWORD=123456
# Redis 数据库编号
REDIS_DB=0

# ==========================================
# 4. JWT 安全配置
# ==========================================
# JWT 密钥 (生产环境请务必使用复杂的随机字符串)
JWT_SECRET_KEY=<REDACTED:JWT_SECRET_KEY>
# JWT 算法
JWT_ALGORITHM=HS256
# Token 过期时间 (单位：分钟)，例如 60 表示 1 小时
ACCESS_TOKEN_EXPIRE_MINUTES=60


# ==========================================
# 5. 生产环境特定配置 (当 APP_ENV=production 时生效)
# ==========================================
# 生产环境域名
PRODUCTION_DOMAIN=<PRODUCTION_DOMAIN>
# 生产环境数据库地址 (通常与开发环境不同)
PROD_DB_HOST=<PROD_DB_HOST>
PROD_DB_PASSWORD=<REDACTED:PROD_DB_PASSWORD>
# 生产环境 Redis 地址
PROD_REDIS_HOST=<PROD_REDIS_HOST>

# ==========================================
# 2. 端口配置
# ==========================================
# 后端 API 服务监听端口
Api-Serve_PORT=8000