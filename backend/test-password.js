import bcrypt from 'bcryptjs';

const password = 'Admin@123';
const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

console.log('Testing password:', password);
console.log('Against hash:', hash);

bcrypt.compare(password, hash).then(result => {
  console.log('Password match:', result);
  
  // Generate a new hash
  bcrypt.hash(password, 10).then(newHash => {
    console.log('\nNew hash for Admin@123:');
    console.log(newHash);
  });
});
