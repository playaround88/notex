# Notex API 文档

## 概述

Notex 提供三套 API 路由，分别对应不同的认证方式和适用场景。

| 认证方式 | 路由前缀 | 认证方式 | 适用场景 |
|---------|---------|---------|---------|
| 内部API | `/api` | JWT Token | 前端 Web 应用 |
| 外部API | `/api/v1` | HashID | 外部 Skill 调用 |
| 公开页面 | `/public` | 无认证 | 公开笔记本 |

---

## 外部API (`/api/v1`) - HashID 认证

### 认证方式

支持两种方式传递 `hash_id`：

**方式1：查询参数**
```bash
GET /api/v1/notebooks?hash_id=abc123
```

**方式2：请求头**
```bash
GET /api/v1/notebooks
Headers: X-Hash-ID: abc123
```

### HashID 规范

- **长度**: 8-16位
- **格式**: Base62 编码
- **字符集**: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`
- **获取方式**: 用户登录后通过 `/api/auth/me` 获取 `hash_id`

### API 端点

#### 笔记本 (Notebooks)

| 方法 | 路径 | 描述 |
|-----|------|-----|
| GET | `/api/v1/notebooks` | 获取所有笔记本列表 |
| GET | `/api/v1/notebooks/stats` | 获取笔记本统计信息（含资源数量） |
| POST | `/api/v1/notebooks` | 创建新笔记本 |
| GET | `/api/v1/notebooks/:id` | 获取指定笔记本详情 |
| PUT | `/api/v1/notebooks/:id` | 更新笔记本 |
| DELETE | `/api/v1/notebooks/:id` | 删除笔记本 |
| GET | `/api/v1/notebooks/:id/overview` | 获取笔记本概览（摘要和问题） |

#### 来源 (Sources)

| 方法 | 路径 | 描述 |
|-----|------|-----|
| GET | `/api/v1/notebooks/:id/sources` | 获取笔记本的所有来源 |
| GET | `/api/v1/notebooks/:id/sources/:sourceId` | 获取指定来源详情 |
| POST | `/api/v1/notebooks/:id/sources` | 添加新来源 |
| DELETE | `/api/v1/notebooks/:id/sources/:sourceId` | 删除指定来源 |

#### 笔记 (Notes)

| 方法 | 路径 | 描述 |
|-----|------|-----|
| GET | `/api/v1/notebooks/:id/notes` | 获取笔记本的所有笔记 |
| POST | `/api/v1/notebooks/:id/notes` | 创建新笔记 |
| DELETE | `/api/v1/notebooks/:id/notes/:noteId` | 删除指定笔记 |

#### 转换 (Transformations)

| 方法 | 路径 | 描述 |
|-----|------|-----|
| POST | `/api/v1/notebooks/:id/transform` | 执行文档转换（摘要、FAQ、PPT等） |

#### 对话 (Chat)

| 方法 | 路径 | 描述 |
|-----|------|-----|
| POST | `/api/v1/notebooks/:id/chat` | 快速对话（自动创建会话） |
| GET | `/api/v1/notebooks/:id/chat/sessions` | 获取所有对话会话 |
| POST | `/api/v1/notebooks/:id/chat/sessions` | 创建新的对话会话 |
| GET | `/api/v1/notebooks/:id/chat/sessions/:sessionId` | 获取指定会话详情 |
| DELETE | `/api/v1/notebooks/:id/chat/sessions/:sessionId` | 删除指定会话 |
| POST | `/api/v1/notebooks/:id/chat/sessions/:sessionId/messages` | 发送消息 |

#### 文件上传

| 方法 | 路径 | 描述 |
|-----|------|-----|
| POST | `/api/v1/upload` | 上传文件 |

---

## 调用示例

### 1. 获取用户 HashID

```bash
# 首先通过 OAuth 登录获取 JWT Token
curl "http://localhost:8080/auth/login/github"

# 使用 Token 获取用户信息（包含 hash_id）
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  http://localhost:8080/api/auth/me

# 响应示例
{
  "id": "uuid-string",
  "hash_id": "abc123XYZ",  // 保存此值用于外部API调用
  "email": "user@example.com",
  "name": "User Name",
  "avatar_url": "...",
  "provider": "github",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 2. 获取笔记本列表

```bash
# 使用查询参数
curl "http://localhost:8080/api/v1/notebooks?hash_id=abc123XYZ"

# 或使用请求头
curl -H "X-Hash-ID: abc123XYZ" \
  http://localhost:8080/api/v1/notebooks
```

### 3. 创建笔记本

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "我的笔记本",
    "description": "用于测试的笔记本"
  }' \
  http://localhost:8080/api/v1/notebooks
```

### 4. 添加来源（文件）

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -F "file=@document.pdf" \
  -F "notebook_id=NOTEBOOK_ID" \
  http://localhost:8080/api/v1/notebooks/NOTEBOOK_ID/sources
```

### 5. 创建笔记

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "summary",
    "prompt": "生成摘要",
    "source_ids": ["SOURCE_ID_1", "SOURCE_ID_2"]
  }' \
  http://localhost:8080/api/v1/notebooks/NOTEBOOK_ID/transform
```

### 6. 对话

```bash
curl -X POST \
  -H "X-Hash-ID: abc123XYZ" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "这个文档讲了什么？",
    "session_id": ""
  }' \
  http://localhost:8080/api/v1/notebooks/NOTEBOOK_ID/chat
```

---

## 错误响应

所有 API 端点在出错时会返回以下格式的错误响应：

```json
{
  "error": "错误描述信息"
}
```

### 常见错误码

| HTTP 状态码 | 描述 |
|-----------|------|
| 400 | Bad Request - 请求参数错误 |
| 401 | Unauthorized - 未提供 hash_id 或 hash_id 无效 |
| 404 | Not Found - 资源不存在 |
| 500 | Internal Server Error - 服务器内部错误 |

### 认证错误示例

```json
{
  "error": "hash_id parameter or X-Hash-ID header required"
}

{
  "error": "Invalid hash_id"
}

{
  "error": "Invalid hash_id format"
}
```

---

## HashID 生成算法

HashID 使用 Base62 编码生成，由以下组合构成：

1. **时间戳**（毫秒级，40位）- 保证唯一性和排序
2. **随机数**（24位）- 增加不可预测性

算法流程：
```go
timestamp := time.Now().UnixMilli()
randomPart := rand.Uint32() & 0xFFFFFF
hashIDValue := (timestamp << 24) | randomPart
hashID := GenerateBase62ID(hashIDValue)
```

特性：
- 不可预测：即使知道时间也无法猜测
- 全局唯一：UNIQUE 约束 + 碰撞检测
- URL 友好：只包含字母数字字符

---

## 安全说明

1. **HashID 不是密码**：它是一个公开的访问令牌，用于 API 调用
2. **不要泄露 HashID**：虽然它不是敏感凭证，但应该妥善保管
3. **定期更换**：如果 HashID 泄露，可以通过重新注册用户获取新的 HashID
4. **日志审计**：所有 API 调用都会记录到审计日志中

---

## 版本历史

| 版本 | 日期 | 说明 |
|-----|------|-----|
| v1.0 | 2024-03-04 | 初始版本，支持 HashID 认证的外部 API |
