const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 付费用户列表文件路径
const PREMIUM_USERS_FILE = path.join(__dirname, '../../premium_users.json');
// 用户数据文件路径
const USERS_FILE = path.join(__dirname, '../../users.json');

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

// 读取用户数据
function getUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading users file:', error);
  }
  return { users: [] };
}

// 保存用户数据
function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving users file:', error);
  }
}

// 生成简单的 token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 简单的密码哈希（生产环境应该使用 bcrypt）
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
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

// 用户注册
router.post('/register', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const users = getUsers();

  // 检查用户是否已存在
  const existingUser = users.users.find(user => user.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  // 创建新用户
  const newUser = {
    email,
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  users.users.push(newUser);
  saveUsers(users);

  res.json({
    success: true,
    message: 'User registered successfully'
  });
});

// 用户登录
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = getUsers();

  // 查找用户
  const user = users.users.find(user => user.email === email);
  if (!user) {
    return res.status(400).json({ error: 'User not found' });
  }

  // 验证密码
  if (user.password !== hashPassword(password)) {
    return res.status(400).json({ error: 'Invalid password' });
  }

  // 生成 token
  const token = generateToken();

  // 更新用户 token
  user.token = token;
  user.updatedAt = new Date().toISOString();
  saveUsers(users);

  res.json({
    success: true,
    message: 'Login successful',
    token
  });
});

// 获取用户信息
router.get('/profile', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Token is required' });
  }

  const users = getUsers();

  // 查找用户
  const user = users.users.find(user => user.token === token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // 检查是否是付费用户
  const premiumUsers = getPremiumUsers();
  const isPremium = premiumUsers.users.some(premiumUser => premiumUser.email === user.email && premiumUser.active);

  res.json({
    email: user.email,
    isPremium,
    createdAt: user.createdAt
  });
});

module.exports = router;
