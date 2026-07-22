const db = require("../db/index");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

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

    // 构建实际存储路径（含可选的二级文件夹）
    const filePath = subFolder
      ? path.join("./public/uploads", folder, subFolder)
      : path.join("./public/uploads", folder);

    // 确保目标目录存在
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
    }

    for (const file of files) {
      const newName = Buffer.from(file.originalname, "latin1").toString("utf8");
      const destPath = path.join(filePath, newName);

      // 从内存写入磁盘
      fs.writeFileSync(destPath, file.buffer);

      // 插入到 images 表（image_url 包含相对路径，如 subFolder/filename）
      const imageUrl = subFolder ? `${subFolder}/${newName}` : newName;
      const sql = "INSERT INTO images SET ?";
      results.push(
        new Promise((resolve, reject) => {
          db.query(sql, { image_url: imageUrl, onlyId, account }, (err, result) => {
            if (err) return reject(err);
            resolve({ image_url: imageUrl });
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
