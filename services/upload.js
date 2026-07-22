const db = require("../db/index");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

// 允许的上传文件夹白名单
const ALLOWED_FOLDERS = ["cards", "covers"];

// 动态 multer 存储配置：根据 query 参数 folder 和 subFolder 决定存储目录
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.query.folder;
    if (!folder || !ALLOWED_FOLDERS.includes(folder)) {
      return cb(new Error("无效的 folder 参数，必须为 cards 或 covers"));
    }

    const subFolder = req.query.subFolder;
    let dest = path.join("./public/uploads", folder);

    // 如果传了 subFolder，拼接二级目录并自动创建
    if (subFolder) {
      dest = path.join(dest, subFolder);
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
    } else {
      // 确保一级目录存在
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
    }

    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // 临时文件名，后续会 rename 为原始文件名
    cb(null, crypto.randomUUID() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// 通用上传接口
exports.uploadImage = [
  upload.array("files"),
  (req, res) => {
    const folder = req.query.folder;
    const subFolder = req.query.subFolder;
    const account = req.body.account;

    if (!req.files || req.files.length === 0) {
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

    for (const file of req.files) {
      let oldName = file.filename;
      let newName = Buffer.from(file.originalname, "latin1").toString("utf8");

      // 重命名为原始文件名
      fs.renameSync(
        path.join(filePath, oldName),
        path.join(filePath, newName)
      );

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
