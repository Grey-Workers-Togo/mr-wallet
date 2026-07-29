import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '.env') });
