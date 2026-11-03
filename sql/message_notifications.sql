-- 帖子回复通知表
CREATE TABLE IF NOT EXISTS `message_notifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` INT UNSIGNED NOT NULL COMMENT '关联的帖子ID',
  `reply_id` INT UNSIGNED NOT NULL COMMENT '关联的回复ID',
  `from_account` VARCHAR(100) NOT NULL COMMENT '发起回复的用户',
  `to_account` VARCHAR(100) NOT NULL COMMENT '被回复的用户（帖子作者或被回复的评论者）',
  `is_read` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未读, 1=已读',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_to_account` (`to_account`, `is_read`, `create_time` DESC),
  INDEX `idx_reply_id` (`reply_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='帖子回复通知表';
