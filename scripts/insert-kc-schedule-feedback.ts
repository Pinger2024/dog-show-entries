import { db } from '../src/server/db';
import { feedback } from '../src/server/db/schema';
import { randomUUID } from 'crypto';

const textBody = `KC Show Schedule Requirements — Research Findings

Based on research into Kennel Club regulations, here is what show schedules must include:

=== MANDATORY ELEMENTS (KC Regulations) ===

1. SHOW DETAILS
   - Full name of the show-giving society
   - Type of show (Championship, Open, Limited, etc.)
   - Date(s) of the show
   - Venue name and full address
   - Whether benched or unbenched
   - KC licence number (once granted)

2. OFFICERS & CONTACTS
   - Show Secretary name, address, phone, email
   - Show Manager (if different from Secretary)
   - Veterinary Surgeon on duty (name and practice)

3. JUDGES
   - Full list of judges with their assignments (which breeds/groups they are judging)
   - Reserve judges if appointed

4. CLASSES & ENTRY INFORMATION
   - Complete list of classes offered with definitions
   - Entry fees (first entry, subsequent entries, NFC)
   - How to enter (online/postal/both)
   - Closing date for entries (postal and online if different)
   - Whether Not For Competition entries are accepted

5. CLASS DEFINITIONS
   - KC standard class definitions must be printed in full
   - Any special classes must have clear eligibility criteria

6. RULES & REGULATIONS
   - Statement that the show is held under KC Rules & Regulations
   - KC "Standard Wording" paragraphs (these are prescribed text blocks the KC requires)
   - Declaration regarding dog health and welfare
   - Right of refusal clause

7. AWARDS & PRIZES
   - Prize money or rosettes offered per class
   - Any special awards or trophies
   - Best in Show, Reserve Best in Show judging arrangements
   - Best Puppy in Show if offered

8. SCHEDULE OF FEES
   - Entry fees clearly stated
   - Catalogue price
   - Any additional charges (benching fees, car parking, etc.)

9. TIMING
   - Judging start time
   - Time doors/grounds open
   - Time for removal of dogs (if applicable)

=== RECOMMENDED BUT NOT STRICTLY MANDATORY ===

10. PRACTICAL INFORMATION
    - Car parking arrangements
    - Catering availability
    - Whether dogs can be left in vehicles (welfare notice)
    - Accessibility information
    - Photography policy

11. BREED-SPECIFIC INFORMATION
    - Breed class order (typically: Dog classes, then Bitch classes)
    - Group structure for variety/group shows

12. HEALTH REQUIREMENTS
    - Vaccination requirements
    - KC health schemes relevant to breed
    - Breed watch information (for breeds on the KC's breed watch list)

=== KEY KC PRESCRIBED WORDINGS ===

The KC mandates specific paragraphs that MUST appear word-for-word:
- The "Regulations" paragraph about KC Rules
- The "Entry" paragraph about eligibility
- The "Dogs in Cars" welfare warning
- The "Data Protection" notice
- Various declarations the exhibitor agrees to by entering

=== WHAT REMI SHOULD CAPTURE ===

For our schedule builder, we should ensure we can capture/generate:
- All mandatory fields above (most we already have in the show schema)
- Judge assignments (we have this via judge_assignments table)
- Class definitions with standard KC wording (could be templated)
- Prescribed KC text blocks (these should be stored as templates since they're standard)
- Entry form / declaration wording

=== GAPS IN OUR CURRENT SCHEMA ===

Things we might need to add:
- Benched/unbenched flag
- Show Manager (separate from Secretary)
- Catalogue price field
- Car parking info
- KC prescribed text template storage
- Prize/award definitions per class
- Best in Show judging arrangements

=== NEXT STEPS ===

Amanda — please review this list and let us know:
1. Which of the "recommended" items you always include in your schedules?
2. Are there any items we've missed that you know the KC requires?
3. Do you have a sample schedule we could use as a reference template?
4. Which KC prescribed wordings do you currently use?

This will help us build a comprehensive schedule builder that ensures all KC requirements are met automatically.`;

async function main() {
  if (!db) {
    console.log('No DB');
    process.exit(1);
  }

  const result = await db.insert(feedback).values({
    resendEmailId: `internal-kc-schedule-research-${randomUUID()}`,
    fromEmail: 'system@remishowmanager.co.uk',
    fromName: 'Remi (Research)',
    subject: 'KC Show Schedule Requirements — What Must Be Included',
    textBody,
    status: 'pending',
    source: 'email',
    feedbackType: 'feature',
    notes: 'Awaiting feedback from Amanda on KC schedule requirements. Auto-generated from research — not an actual email.',
  }).returning({ id: feedback.id });

  console.log('Inserted feedback record:', result[0].id);
  process.exit(0);
}

main();
