import 'dotenv/config';
import { Resend } from 'resend';

async function main() {
  const key = process.env.RESEND_API_KEY;
  console.log(`Key from env (first 10): ${key?.slice(0, 10)}...`);

  const resend = new Resend(key);

  console.log('Attempting to send via SDK...');
  try {
    const result = await resend.emails.send({
      from: 'Remi <noreply@remishowmanager.co.uk>',
      to: ['michael@prometheus-it.com'],
      subject: 'SDK test ' + new Date().toISOString(),
      html: '<p>Testing Resend SDK directly from the Remi project</p>',
    });
    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error caught:', err);
  }
}
main();
