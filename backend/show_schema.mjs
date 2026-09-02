import 'dotenv/config';
import { query } from './src/config/database.js';

const [r1] = await query('SHOW CREATE TABLE recipes');
const [r2] = await query('SHOW CREATE TABLE recipe_items');
console.log('=== recipes ===');
console.log(r1['Create Table']);
console.log('\n=== recipe_items ===');
console.log(r2['Create Table']);
process.exit(0);
