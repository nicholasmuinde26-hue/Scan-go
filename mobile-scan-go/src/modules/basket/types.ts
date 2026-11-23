export type BasketLine={productId:string;name:string;quantity:number;unitPriceMinor:number;labelBarcode?:string;weightGrams?:number};
export type Basket={_id:string;storeId:string;status:'OPEN'|'CONVERTED';items:BasketLine[];totalItems:number;totalMinor:number};
