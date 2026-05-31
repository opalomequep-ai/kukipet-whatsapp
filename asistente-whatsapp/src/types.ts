export interface Producto {
  categoria: string;
  codigo: string;
  nombre: string;
  unidad: string;
  precio: number;
  raw: Record<string, string>;
}

export interface ItemPedido {
  codigo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface DatosCliente {
  nombre?: string;
  telefono: string;
  direccion?: string;
  metodoPago?: string;
  notas?: string;
}

export interface PedidoConfirmado {
  cliente: DatosCliente;
  items: ItemPedido[];
  total: number;
}
