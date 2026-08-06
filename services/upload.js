const db = require("../db/index");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

// 允许的上传文件夹白名单
const ALLOWED_FOLDERS = ["cards", "covers"];

// 使用内存存储，避免 destination 回调中 req.body 尚未解析的问题
const upload = multer({ storage: multer.memoryStorage() });

// 通用上传接口
exports.uploadImage = [
  upload.fields([
    { name: "files", maxCount: 20 },
    { name: "file", maxCount: 20 },
  ]),
  (req, res) => {
    // 兼容 files 和 file 两种字段名
    const files = [].concat(req.files?.["files"] || [], req.files?.["file"] || []);

    // 从 body 或 query 中获取参数（兼容 form-data 和 URL query 两种传参方式）
    const folder = req.body?.folder || req.query.folder;
    const subFolder = req.body?.subFolder || req.query.subFolder;
    const account = req.body?.account;

    if (files.length === 0) {
      return res.send({
        status: 400,
        message: "请上传文件",
      });
    }

    if (!folder || !ALLOWED_FOLDERS.includes(folder)) {
      return res.send({
        status: 400,
        message: "无效的 folder 参数，必须为 cards 或 covers",
      });
    }

    if (!account) {
      return res.send({
        status: 400,
        message: "缺少 account 参数",
      });
    }

    const onlyId = crypto.randomUUID();
    const results = [];

    // 构建实际存储路径（含可选的二级文件夹），使用绝对路径方便后续直接读取
    const basePublicDir = path.resolve(__dirname, "../public");
    const filePath = subFolder
      ? path.resolve(basePublicDir, "uploads", folder, subFolder)
      : path.resolve(basePublicDir, "uploads", folder);

    // 确保目标目录存在
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
    }

    const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"];

    for (const file of files) {
      const originName = Buffer.from(file.originalname, "latin1").toString("utf8");
      const rawExt = path.extname(originName);
      const ext = rawExt.toLowerCase();
      const baseName = path.basename(originName, rawExt);

      const isCompressibleImage = imageExts.includes(ext);
      const targetExt = isCompressibleImage ? ".webp" : ext;
      const newName = `${baseName}_${onlyId}${targetExt}`;
      const destPath = path.join(filePath, newName);

      // 处理图片压缩与格式转换
      let processPromise;
      if (isCompressibleImage) {
        processPromise = sharp(file.buffer)
          .webp({ quality: 80 })
          .toFile(destPath);
      } else {
        processPromise = Promise.resolve().then(() => fs.writeFileSync(destPath, file.buffer));
      }

      results.push(
        processPromise.then(() => {
          // 生成 URL 相对路径（去掉 public 前缀），如 /uploads/cards/11111_uuid.webp
          const urlPath = "/" + path.relative(basePublicDir, destPath).replace(/\\/g, "/");
          const sql = "INSERT INTO images SET ?";
          return new Promise((resolve, reject) => {
            db.query(sql, { image_url: urlPath, onlyId, account }, (err, result) => {
              if (err) return reject(err);
              resolve({ image_url: urlPath });
            });
          });
        })
      );
    }

    Promise.all(results)
      .then((imgs) => {
        res.send({
          status: 200,
          message: "上传成功",
          onlyId,
          data: imgs,
        });
      })
      .catch((err) => {
        res.cc(err);
      });
  },
];

// 获取图片流接口
// filePath 入参格式如：/uploads/covers/cover_e28e8314-29b2-4f44-8d49-d492859e86f5.webp
exports.getImageStream = (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).send({
      status: 400,
      message: "缺少 filePath 参数",
    });
  }

  // 确保对路径进行解码，防止中文等字符因为 URL 编码无法被 file system 识别
  let decodedPath = filePath;
  try {
    decodedPath = decodeURIComponent(filePath);
  } catch (e) {
    console.error("解码 filePath 失败:", e);
  }

  // 防止路径穿越攻击，限制只能访问 public 目录
  const baseDir = path.resolve(__dirname, "../public");
  const realPath = path.join(baseDir, decodedPath);

  // console.log("getImageStream 访问日志:");
  // console.log("- 传入参数 filePath:", filePath);
  // console.log("- 解码后路径 decodedPath:", decodedPath);
  // console.log("- 物理绝对路径 realPath:", realPath);

  if (!realPath.startsWith(baseDir)) {
    console.warn("getImageStream 访问越界被拦截:", realPath);
    return res.status(403).send({
      status: 403,
      message: "禁止访问该路径",
    });
  }

  // 检查文件是否存在
  fs.stat(realPath, (err, stats) => {
    if (err) {
      console.error("getImageStream 获取文件 stat 失败:", err.message);
      return res.status(404).send({
        status: 404,
        message: "文件不存在",
        error: err.message,
        resolvedPath: realPath,
      });
    }

    if (!stats.isFile()) {
      return res.status(404).send({
        status: 404,
        message: "文件不存在",
      });
    }

    // 根据文件类型设置 Content-Type
    const ext = path.extname(realPath).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    // 创建读取流并返回给前端
    const stream = fs.createReadStream(realPath);
    stream.pipe(res);
  });
};

// 辅助函数：递归获取目录下所有的图片文件路径
function getAllImageFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllImageFiles(fullPath, arrayOfFiles);
    } else {
      const ext = path.extname(file).toLowerCase();
      // 支持压缩的物理格式：jpg, jpeg, png, bmp
      if ([".jpg", ".jpeg", ".png", ".bmp"].includes(ext)) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

// 批量压缩线上已存在的图片（原地压缩，零数据库改变，自带自动备份防损坏）
exports.compressExistingImages = async (req, res) => {
  const uploadsDir = path.resolve(__dirname, "../public/uploads");
  const backupBaseDir = path.resolve(__dirname, "../public/backups/compressed_images_backup");

  try {
    const files = getAllImageFiles(uploadsDir);
    let total = files.length;
    let compressedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let savedSizeBytes = 0;
    const errors = [];

    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath);

        // 如果文件小于 150KB，说明图片已经较小，跳过避免重复压缩损坏画质
        if (stat.size < 150 * 1024) {
          skippedCount++;
          continue;
        }

        // 计算相对路径，用于保持备份目录结构
        const relativePath = path.relative(uploadsDir, filePath);
        const backupFilePath = path.join(backupBaseDir, relativePath);
        const backupFileDir = path.dirname(backupFilePath);

        // 1. 自动备份原图（如果尚未备份）
        if (!fs.existsSync(backupFilePath)) {
          if (!fs.existsSync(backupFileDir)) {
            fs.mkdirSync(backupFileDir, { recursive: true });
          }
          fs.copyFileSync(filePath, backupFilePath);
        }

        // 2. 双步写盘：先写入临时文件，成功后再原子覆盖原文件
        const tmpPath = filePath + ".tmp";
        const ext = path.extname(filePath).toLowerCase();

        if (ext === ".png") {
          await sharp(filePath).png({ quality: 80, compressionLevel: 8 }).toFile(tmpPath);
        } else {
          // jpg, jpeg, bmp
          await sharp(filePath).jpeg({ quality: 80, mozjpeg: true }).toFile(tmpPath);
        }

        const newStat = fs.statSync(tmpPath);

        // 如果压缩后文件确实变小了，替换原文件
        if (newStat.size < stat.size) {
          savedSizeBytes += stat.size - newStat.size;
          fs.renameSync(tmpPath, filePath);
          compressedCount++;
        } else {
          // 变大或者没有改善则丢弃临时文件
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          skippedCount++;
        }
      } catch (err) {
        failedCount++;
        errors.push({
          file: path.relative(uploadsDir, filePath),
          message: err.message,
        });
        // 尝试清理遗留的 tmp 文件
        const tmpPath = filePath + ".tmp";
        if (fs.existsSync(tmpPath)) {
          try {
            fs.unlinkSync(tmpPath);
          } catch (e) {}
        }
      }
    }

    res.send({
      status: 200,
      message: "批量压缩图片处理完成",
      data: {
        total,
        compressed: compressedCount,
        skipped: skippedCount,
        failed: failedCount,
        savedSizeMB: (savedSizeBytes / (1024 * 1024)).toFixed(2) + " MB",
        errors,
      },
    });
  } catch (err) {
    res.cc("批量压缩遇到全局异常: " + err.message);
  }
};

// 一键撤销还原原图
exports.rollbackCompressedImages = async (req, res) => {
  const uploadsDir = path.resolve(__dirname, "../public/uploads");
  const backupBaseDir = path.resolve(__dirname, "../public/backups/compressed_images_backup");

  try {
    if (!fs.existsSync(backupBaseDir)) {
      return res.send({
        status: 200,
        message: "不存在备份文件，无需撤销",
        data: { restored: 0, failed: 0 },
      });
    }

    const backupFiles = getAllImageFiles(backupBaseDir);
    let restoredCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const backupPath of backupFiles) {
      try {
        const relativePath = path.relative(backupBaseDir, backupPath);
        const originalPath = path.join(uploadsDir, relativePath);
        const originalDir = path.dirname(originalPath);

        if (!fs.existsSync(originalDir)) {
          fs.mkdirSync(originalDir, { recursive: true });
        }

        // 覆盖还原
        fs.copyFileSync(backupPath, originalPath);
        restoredCount++;
      } catch (err) {
        failedCount++;
        errors.push({
          file: path.relative(backupBaseDir, backupPath),
          message: err.message,
        });
      }
    }

    res.send({
      status: 200,
      message: "一键撤销还原原图完成",
      data: {
        totalBackupFiles: backupFiles.length,
        restored: restoredCount,
        failed: failedCount,
        errors,
      },
    });
  } catch (err) {
    res.cc("撤销恢复遇到全局异常: " + err.message);
  }
};
