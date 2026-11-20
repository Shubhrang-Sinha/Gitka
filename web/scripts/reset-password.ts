import { pool } from "../lib/db";
import { hashPassword } from "../lib/password";

const [email, newPassword] = process.argv.slice(2);
if (!email || !newPassword) {
  console.error("Usage: bun --env-file=.env.local scripts/reset-password.ts EMAIL NEW_PASSWORD");
  process.exit(1);
}

const hash = await hashPassword(newPassword);
const r = await pool.query(
  "UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email",
  [hash, email.toLowerCase()]
);

if (r.rows.length > 0) {
  console.log("Password updated for:", r.rows[0].email);
} else {
  console.log("No user with that email. Users in the database:");
  const all = await pool.query("SELECT id, email FROM users ORDER BY id");
  console.table(all.rows);
}
await pool.end();