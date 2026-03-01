import {
  HelpCircle,
  Dog,
  Ticket,
  CreditCard,
  UserPlus,
  Mail,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata = {
  title: 'Help Centre - Remi',
  description: 'Frequently asked questions and help for using Remi.',
};

const faqs = [
  {
    icon: UserPlus,
    question: 'How do I create an account?',
    answer:
      'Click "Sign In" in the top navigation and follow the prompts to create your account. You can sign in using your email address — no password needed, we send you a secure link.',
  },
  {
    icon: Dog,
    question: 'How do I add my dog?',
    answer:
      'Once signed in, go to "My Dogs" in your dashboard and click "Add Dog". You\'ll need their KC registered name, breed, date of birth, and KC registration number.',
  },
  {
    icon: Ticket,
    question: 'How do I enter a show?',
    answer:
      'Browse available shows from the "Find a Show" page, click on a show that\'s open for entry, select your dog and the classes you want to enter, then pay securely online. Your entry will be confirmed straight away.',
  },
  {
    icon: CreditCard,
    question: 'How are payments handled?',
    answer:
      'Entry fees are processed securely through Stripe — your card details are never stored on our servers. You\'ll receive a confirmation email once your entry is confirmed.',
  },
  {
    icon: Ticket,
    question: 'Can I change or withdraw an entry?',
    answer:
      'Yes. Go to "My Entries" in your dashboard, find the entry, and you can amend your classes or withdraw. Refund policies vary by show — check the show details for their specific policy.',
  },
  {
    icon: HelpCircle,
    question: 'What show types are supported?',
    answer:
      'Remi supports Companion, Primary, Limited, Open, Premier Open, and Championship shows across all Kennel Club recognised breeds.',
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-14 sm:px-6">
      <h1 className="gold-rule font-serif text-3xl font-bold tracking-tight sm:text-4xl">
        Help Centre
      </h1>
      <p className="mt-5 text-lg text-muted-foreground">
        Everything you need to know about using Remi. If you can&apos;t find
        what you need here, get in touch and we&apos;ll be happy to help.
      </p>

      <div className="mt-12 space-y-5">
        {faqs.map((faq) => (
          <Card key={faq.question}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <faq.icon className="size-5 text-primary" />
                </div>
                {faq.question}
              </CardTitle>
            </CardHeader>
            <CardContent className="pl-4 sm:pl-16">
              <p className="leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 rounded-xl border bg-card p-8 text-center">
        <Mail className="mx-auto size-10 text-primary/40" />
        <h2 className="mt-4 font-serif text-lg font-bold">Still need help?</h2>
        <p className="mt-2 text-muted-foreground">
          Drop us an email at{' '}
          <a
            href="mailto:support@remishow.co.uk"
            className="text-primary hover:underline"
          >
            support@remishow.co.uk
          </a>{' '}
          and we&apos;ll get back to you as soon as possible.
        </p>
      </div>
    </div>
  );
}
