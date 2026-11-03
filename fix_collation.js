const db = require('./db/index');

// 先删除旧表
const dropSql = 'DROP TABLE IF EXISTS `message_notifications`';

// 重新创建，指定 utf8mb4_general_ci 排序规则
const createSql = `
CREATE TABLE IF NOT EXISTS \`message_notifications\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`message_id\` INT UNSIGNED NOT NULL COMMENT '关联的帖子ID',
  \`reply_id\` INT UNSIGNED NOT NULL COMMENT '关联的回复ID',
  \`from_account\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '发起回复的用户',
  \`to_account\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '被回复的用户（帖子作者或被回复的评论者）',
  \`is_read\` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未读, 1=已读',
  \`create_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_to_account\` (\`to_account\`, \`is_read\`, \`create_time\` DESC),
  INDEX \`idx_reply_id\` (\`reply_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='帖子回复通知表';
`;

db.query(dropSql, (err1) => {
  if (err1) {
    console.error('删除旧表失败:', err1.message);
    process.exit(1);
  }
  console.log('旧表已删除');
  
  db.query(createSql, (err2, result) => {
    if (err2) {
      console.error('建表失败:', err2.message);
      process.exit(1);
    }
    console.log('建表成功:', JSON.stringify(result));
    process.exit(0);
  });
});
