# 🏆 نظام الكوميشنز

نظام إدارة عمولات المبيعات — يُصرف بعد التحصيل الكامل فقط.

## خطوات الرفع على GitHub Pages

### 1. إنشاء Repository جديد
- اذهب إلى github.com
- اضغط **New repository**
- اسمه: `commission-system`
- اضغط **Create repository**

### 2. رفع الملفات
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/commission-system.git
git push -u origin main
```

### 3. تفعيل GitHub Pages
- اذهب إلى **Settings** في الـ Repository
- من القائمة اليسرى: **Pages**
- في **Source**: اختر **GitHub Actions**
- احفظ

### 4. الموقع هيكون جاهز على:
```
https://YOUR_USERNAME.github.io/commission-system/
```

## تشغيل محلياً
```bash
npm install
npm run dev
```
