export interface Transaction {
  Tipoabt: string;
  operadorABT: string;
  codigotipotrx: number;
  nombreTRX: string;
  fecha_trx: string;
  fecha_ajuste: string | null;
  codproducto: number;
  nombreproducto: string;
  operador: string;
  estacion: string;
  servicio: string | null;
  MONTO_ABONO: number;
  MONTO_DESCUENTO: number;
}

export interface CardData {
  estado: number;
  mensaje: string;
  estadoVigencia: string;
  tipoEstudiante: string;
  nombreEstudiante: string;
  fechaterminoVig: string | null;
  saldo: string;
  estadoCuenta: string;
  tipoCuenta: string;
  numabt: string;
  listaTransacciones: Transaction[];
  numtarjetaExt: string;
  rut: string | null;
}
