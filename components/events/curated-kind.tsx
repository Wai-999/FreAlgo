import { Badge } from '@/components/ui/badge';

const KIND: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning'; help: string }> =
  {
    FACT: { label: 'Fact', tone: 'neutral', help: 'A dated fact, with its source.' },
    INTERPRETATION: {
      label: 'Interpretation',
      tone: 'info',
      help: 'Someone’s reading of the facts, attributed to its source.',
    },
    ANALOGY: {
      label: 'Analogy',
      tone: 'warning',
      help: 'A comparison with another situation. Not a fact about this event.',
    },
  };

/** Labels every curated statement as fact, interpretation or analogy (spec §3 timelines). */
export function CuratedKind({ kind }: { kind: string }) {
  const k = KIND[kind] ?? KIND.FACT!;
  return (
    <Badge tone={k.tone} title={k.help}>
      {k.label}
    </Badge>
  );
}
