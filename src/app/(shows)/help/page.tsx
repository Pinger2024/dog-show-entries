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
  title: 'Help - Remi',
  description: 'Frequently asked questions and help for using Remi.',
};

const faqs = [
  {
    icon: UserPlus,
    question: 'How do I create an account?',
    answer:
      'Click "Sign In" in the top navigation and follow the prompts to create your account. You can sign in using your email address.',
  },
  {
    icon: Dog,
    question: 'How do I add my dog?',
    answer:
      'Once signed in, go to "My Dogs" in your dashboard and click "Add a Dog". You\'ll need their registered name, breed, date of birth, and KC registration number if applicable.',
  },
  {
    icon: Ticket,
    question: 'How do I enter a show?',
    answer:
      'Browse available shows from the Shows page, click on a show that\'s accepting entries, select your dog and the classes you want to enter, then proceed to payment.',
  },
  {
    icon: CreditCard,
    question: 'How are payments handled?',
    answer:
      'Entry fees are processed securely through Stripe. Payments go directly to the show society. You\'ll receive a confirmation email once your entry is confirmed.',
  },
  {
    icon: Ticket,
    question: 'Can I withdraw an entry?',
    answer:
      'Yes. Go to "My Entries" in your dashboard, find the entry, and click "Withdraw". Refund policies vary by show — check the show details for their specific policy.',
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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Help Centre
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Everything you need to know about using Remi.
      </p>

      <div className="mt-10 space-y-4">
        {faqs.map((faq) => (
          <Card key={faq.question}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-base">
                <faq.icon className="size-5 text-primary" />
                {faq.question}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10 rounded-lg border bg-muted/30 p-6 text-center">
        <Mail className="mx-auto size-8 text-muted-foreground/50" />
        <h2 className="mt-3 font-semibold">Still need help?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contact us at{' '}
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
