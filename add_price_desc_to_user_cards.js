const db = require("./db/index");

const sql = `
ALTER TABLE \`user_cards\` 
ADD COLUMN \`price_desc\` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '价格描述';
`;

console.log("正在为 user_cards 表添加 price_desc 字段...");
db.query(sql, (err, result) => {
  if (err) {
    if (err.errno === 1060 || err.code === 'ER_DUP_FIELDNAME') {
      console.log("price_desc 字段已存在，跳过。");
      process.exit(0);
    }
    console.error("添加字段失败:", err);
    process.exit(1);
  }
  console.log("字段 price_desc 添加成功！");
  process.exit(0);
});
