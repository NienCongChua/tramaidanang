# Deploy với Supabase

## 1. Tạo database Supabase

1. Tạo project trên Supabase.
2. Mở SQL Editor.
3. Chạy toàn bộ nội dung trong `supabase-schema.sql`.
4. Vào Project Settings -> API, lấy:
   - Project URL
   - anon public key

## 2. Cấu hình biến môi trường

Tạo các biến môi trường sau trên máy local hoặc nền tảng deploy:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

Nếu dùng AI/thời tiết/TTS qua local server hoặc serverless API, cấu hình thêm các biến trong `.env.example`.

## 3. Chạy local

Tạo file `.env` từ `.env.example`, điền `SUPABASE_URL` và `SUPABASE_ANON_KEY`, rồi chạy:

```bash
npm start
```

Local server sẽ tự sinh nội dung `/config.js` từ `.env`.

## 4. Deploy static

Build command:

```bash
npm run build
```

Output directory:

```bash
.
```

Lệnh build sẽ tạo `config.js` từ biến môi trường của nền tảng deploy. File `config.js` đã nằm trong `.gitignore`, không cần commit.

## 5. Vercel

1. Import GitHub repo vào Vercel.
2. Framework preset: Other.
3. Build command: `npm run build`
4. Output directory: `.`
5. Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Deploy.

## 6. Netlify

1. Import GitHub repo vào Netlify.
2. Build command: `npm run build`
3. Publish directory: `.`
4. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Deploy.
