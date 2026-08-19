import type { Professional, Procedure, Room } from "./types";

// Catálogo de reserva: o que a Agenda mostra enquanto a clínica não cadastrou
// os próprios profissionais/salas/procedimentos em Configurações. NÃO é dado
// exibido como se fosse real — os agendamentos vêm todos de `getAgendaOverview`.
// (As listas de agendamentos, bloqueios e fila de espera de exemplo que viviam
// aqui foram removidas: ninguém as importava e só serviam para confundir.)

export const professionals: Professional[] = [
  { id: "1", name: "Dr. Carlos", specialty: "Implantodontia" },
  { id: "2", name: "Dra. Ana", specialty: "Clínica Geral" },
  { id: "3", name: "Dr. João", specialty: "Ortodontia" },
];

export const rooms: Room[] = [
  { id: "1", name: "Sala 01" },
  { id: "2", name: "Sala 02" },
  { id: "3", name: "Sala Cirúrgica" },
];

export const procedures: Procedure[] = [
  { id: "1", name: "Consulta", duration: 60, price: 200 },
  { id: "2", name: "Implante Unitário", duration: 90, price: 4500 },
  { id: "3", name: "Limpeza + Raspagem", duration: 60, price: 350 },
  { id: "4", name: "Clareamento", duration: 90, price: 850 },
  { id: "5", name: "Tratamento de Canal", duration: 90, price: 1200 },
  { id: "6", name: "Avaliação Ortodôntica", duration: 60, price: 150 },
];
