import { useMutation } from '@tanstack/react-query'; import { cartApi } from './api';
export const useCreateCollectOrder=()=>useMutation({mutationFn:cartApi.createOrder});
