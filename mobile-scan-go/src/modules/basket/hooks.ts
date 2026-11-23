import { useMutation, useQueryClient } from '@tanstack/react-query'; import { basketApi } from './api';
export const useScanItem=()=>{const qc=useQueryClient();return useMutation({mutationFn:({basketId,barcode}:{basketId:string;barcode:string})=>basketApi.scan(basketId,barcode),onSuccess:(_,v)=>qc.invalidateQueries({queryKey:['basket',v.basketId]})});};
export const useOpenBasket=()=>useMutation({mutationFn:(storeId:string)=>basketApi.open(storeId)});
export const useCheckoutBasket=()=>useMutation({mutationFn:(basketId:string)=>basketApi.checkout(basketId)});
export const useUpdateBasketLine=()=>{const qc=useQueryClient();return useMutation({mutationFn:({basketId,productId,quantity}:{basketId:string;productId:string;quantity:number})=>basketApi.quantity(basketId,productId,quantity),onSuccess:(_,v)=>qc.invalidateQueries({queryKey:['basket',v.basketId]})});};
