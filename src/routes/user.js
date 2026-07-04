const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 付费用户列表文件路径
const PREMIUM_USERS_FILE = path.join(__dirname, '../../premium_users.json');

// 读取付费用户列表
function getPremiumUsers() {
  try {
    if (fs.existsSync(PREMIUM_USERS_FILE)) {
      const data = fs.readFileSync(PREMIUM_USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading premium users file:', error);
  }
  return { users: [] };
}

// 保存付费用户列表
function savePremiumUsers(data) {
  try {
    fs.writeFileSync(PREMIUM_USERS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving premium users file:', error);
  }
}

// 检查用户是否是付费用户
router.get('/check-premium', (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.json({ isPremium: false, message: 'Email is required' });
  }

  const premiumUsers = getPremiumUsers();
  const isPremium = premiumUsers.users.some(user => user.email === email && user.active);

  res.json({
    isPremium,
    message: isPremium ? 'Premium user' : 'Free user'
  });
});

// 添加付费用户（管理员用）
router.post('/add-premium', (req, res) => {
  const { email, plan } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const premiumUsers = getPremiumUsers();

  // 检查用户是否已存在
  const existingUser = premiumUsers.users.find(user => user.email === email);
  if (existingUser) {
    existingUser.active = true;
    existingUser.plan = plan || 'premium';
    existingUser.updatedAt = new Date().toISOString();
  } else {
    premiumUsers.users.push({
      email,
      plan: plan || 'premium',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  savePremiumUsers(premiumUsers);

  res.json({
    success: true,
    message: `User ${email} added to premium list`
  });
});

// 移除付费用户（管理员用）
router.post('/remove-premium', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const premiumUsers = getPremiumUsers();
  const userIndex = premiumUsers.users.findIndex(user => user.email === email);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  premiumUsers.users[userIndex].active = false;
  premiumUsers.users[userIndex].updatedAt = new Date().toISOString();

  savePremiumUsers(premiumUsers);

  res.json({
    success: true,
    message: `User ${email} removed from premium list`
  });
});

// 获取所有付费用户（管理员用）
router.get('/list-premium', (req, res) => {
  const premiumUsers = getPremiumUsers();
  res.json({
    users: premiumUsers.users.filter(user => user.active)
  });
});

module.exports = router;
