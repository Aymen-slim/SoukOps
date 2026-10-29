export type PersonaId = "new" | "returning" | "bad";

export interface Persona {
  id: PersonaId;
  label: string;
  customerName: string;
  phone: string;
}

export const PERSONAS: Persona[] = [
  { id: "new", label: "Nouveau client", customerName: "Yasmine Ben Salah", phone: "+21620111222" },
  { id: "returning", label: "Client fidèle", customerName: "Amine Trabelsi", phone: "+21698333444" },
  { id: "bad", label: "Mauvais acheteur", customerName: "Karim Gharbi", phone: "+21624555666" },
];

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
