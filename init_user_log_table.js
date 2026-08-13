const db = require("./db/index");

const sql = `
CREATE TABLE IF NOT EXISTS \`user_logs\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`account\` varchar(50) NOT NULL COMMENT '操作账号',
  \`nickname\` varchar(100) DEFAULT NULL COMMENT '操作昵称',
  \`role\` varchar(20) DEFAULT 'user' COMMENT '角色：user/admin',
  \`action\` varchar(100) NOT NULL COMMENT '操作类型',
  \`detail\` text NOT NULL COMMENT '操作详情',
  \`create_time\` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (\`id\`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic COMMENT = '用户操作日志表';
`;

console.log("正在创建 user_logs 表...");
db.query(sql, (err, result) => {
  if (err) {
    console.error("创建表失败:", err);
    process.exit(1);
  }
  console.log("用户操作日志表创建成功或已存在！");
  process.exit(0);
});
