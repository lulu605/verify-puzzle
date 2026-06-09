---
name: verify-puzzle
description: "Verify Puzzle mini-program: visual-novel-style puzzle game with dialogue typewriter effect, character images, answer verification, and an admin backend. Use when working on this project's code under C:/verify-puzzle. Covers server.js, puzzle.js, admin.js, nodes.json, and the Express API."
---

# Verify Puzzle Mini-Program

Visual-novel-style puzzle game: narrative dialogue (typewriter effect) + character art + answer verification, with a full admin backend.

## Quick Start

```bash
node C:\verify-puzzle\server.js
```

- User: `http://localhost:3000/puzzle/`
- Admin: `http://localhost:3000/admin/`

## Project Structure

```
C:\verify-puzzle\
  server.js          — Express server, all API endpoints
  config/
    nodes.json       — Story node data (node_id, dialogues, puzzle)
  public/
    puzzle/
      index.html     — User puzzle page (cover screen, character area, dialogue box)
    admin/
      index.html     — Admin editor (3 tabs: basic info, dialogues, puzzle settings)
    js/
      puzzle.js      — Typewriter effect, playDialogue, loadNode, verify, showSuccess, history
      admin.js       — CRUD, auto-save, dialogue reorder, image upload, live preview
    css/
      admin.css      — Admin styles (preview phone, dialogue cards)
  uploads/           — Uploaded images (≤2MB, JPG/PNG)
  package.json
```

## Data Model

### nodes.json Structure

```json
{
  "nodes": [
    {
      "node_id": "8-char uuid",
      "node_name": "节点名称",
      "background": { "type": "color", "value": "#0a0e27" },
      "dialogues": [
        {
          "text": "对话文本",
          "insert_image": "/uploads/xxx.png",
          "typewriter_speed": 20,
          "speaker": "说话人",
          "speaker_avatar": "/uploads/xxx.png"
        }
      ],
      "puzzle": {
        "question_text": "请输入答案",
        "question_image": null,
        "correct_answer": "正确答案",
        "answer_match_rule": "exact|case_insensitive|fuzzy",
        "max_attempts": 3,
        "error_hint": "答案不对，再想想！"
      },
      "next_node_id": null
    }
  ]
}
```

### Dialogue Fields
| Field | Type | Description |
|---|---|---|
| `text` | string | Dialogue text. Auto-strips `SpeakerName：` prefix at display time |
| `insert_image` | string\|null | **Character art** — shown at top (priority over `speaker_avatar`). NOT displayed inside dialogue box |
| `typewriter_speed` | number | characters/second (default 20) |
| `speaker` | string | Speaker name shown in label |
| `speaker_avatar` | string\|null | Fallback character art (used when `insert_image` is null) |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload image (multipart, ≤2MB) → `{ url: "/uploads/xxx.png" }` |
| GET | `/api/nodes` | List all nodes |
| GET | `/api/nodes/:id` | Get single node with all dialogues & puzzle |
| POST | `/api/nodes` | Create new node → `{ node_id, node_name, ... }` |
| PUT | `/api/nodes/:id` | Update node metadata (name, background, next_node_id) |
| DELETE | `/api/nodes/:id` | Delete node |
| PUT | `/api/nodes/:id/dialogues` | Replace all dialogues `{ dialogues: [...] }` |
| PUT | `/api/nodes/:id/puzzle` | Update puzzle config `{ question_text, ... }` |
| POST | `/api/verify` | Verify answer `{ node_id, answer }` → `{ correct, next_node_id }` |

## Key Behaviors

### Puzzle Flow
1. **Cover screen** with "开始游戏" button; animated starfield background
2. **Dialogue playback**: character art (upper 50%), dialogue box (bottom), speaker label
   - Typewriter text effect (click anywhere advances)
   - Old dialogues cleared each segment; history accessible via "查看历史会话" button
   - `click-hint` (▸) shown after each dialogue finishes
3. **Puzzle phase**: question + answer input; auto-transition to next node on correct answer
   - 3 match rules: `exact`, `case_insensitive`, `fuzzy`
4. **End of chain**: node selection overlay if no `next_node_id`
5. Character art uses `object-fit: cover` to fill upper 50%; `floatRabbit` animation (translateY -6px, 2.5s)

### Admin Editor
- 3 tabs: 基本信息 (basic info + background), 对话编辑 (dialogue list + live preview), 验证设置 (puzzle config)
- **Auto-save**: debounced 400ms on every input change
- **Save button** ("💾 保存") for explicit save + refresh
- **Live preview**: mini phone showing current dialogue card's character art, speaker, text
- **Image upload**: per-dialogue "上传" button → URL stored as `insert_image`
- Dialogue cards: reorder (↑↓), delete (×), speaker name + avatar URL fields

### Character Image Priority
- Each dialogue's `insert_image` = character art (first priority)
- `speaker_avatar` = fallback character art
- Images are NEVER displayed inside the dialogue box (they're character art at top)

## Common Tasks

### Add a new node
POST `/api/nodes` with `{ "node_name": "my node" }` → get back `node_id`.

### Modify dialogues
PUT `/api/nodes/:id/dialogues` with `{ "dialogues": [...] }`.

### Verify answer logic
POST `/api/verify` with `{ "node_id": "...", "answer": "..." }`.
Match rules:
- `exact`: exact string match
- `case_insensitive`: case-insensitive match
- `fuzzy`: substring match either way

### Enable public access
If localtunnel is installed, run:
```bash
npx localtunnel --port 3000
```
Or download ngrok from `https://ngrok.com/download` and run:
```bash
ngrok http 3000
```

## Testing
1. Start server: `node C:\verify-puzzle\server.js`
2. Open admin: `http://localhost:3000/admin/`
3. Open puzzle: `http://localhost:3000/puzzle/`
4. All pages return HTTP 200 on test.

## Important Notes
- Server reads `nodes.json` on each API call (no in-memory cache), so file edits take effect immediately
- Static files (`puzzle.js`, `admin.js`, `index.html`) are served directly — browser cache may need hard refresh
- Character image is shown at top with `object-fit: cover`, NOT inside dialogue box
- Dialogue text auto-strips `SpeakerName：` prefix at runtime if it matches the `speaker` field
