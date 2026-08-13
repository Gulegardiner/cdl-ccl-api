const db = require("./db/index");

const sql = `
CREATE TABLE IF NOT EXISTS \`update_logs\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`version\` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '版本号',
  \`title\` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '更新标题',
  \`content\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '更新内容',
  \`images\` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '配图JSON数组或逗号分隔',
  \`status\` int(1) NOT NULL DEFAULT 1 COMMENT '状态：1正常，0已删除',
  \`create_time\` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (\`id\`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic COMMENT = '更新日志表';
`;

console.log("正在创建 update_logs 表...");
db.query(sql, (err, result) => {
  if (err) {
    console.error("创建表失败:", err);
    process.exit(1);
  }
  console.log("更新日志表创建成功或已存在！");
  process.exit(0);
});
