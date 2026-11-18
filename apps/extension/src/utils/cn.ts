type ClassValue = string | false | null | undefined;

/** Joins truthy class names: `cn('a', isOn && 'b')`. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
