// The CloudFormation behind each deploy template (shared/templates/<id>.yaml, cfn-lint clean): what a drawing becomes
// when you build it. Shown and downloaded in the panel (src/ui/TemplateView.tsx); nothing here is sent anywhere.
const BODIES = import.meta.glob('../../shared/templates/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The template's YAML, or undefined for a template without one. */
export const templateBody = (id: string): string | undefined => BODIES[`../../shared/templates/${id}.yaml`];
