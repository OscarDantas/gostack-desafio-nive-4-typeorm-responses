import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Could not find any customer with the given id.');
    }

    const existentsProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentsProducts.length) {
      throw new AppError('Could not find any products with the given ids.');
    }

    const existentsProductsIds = existentsProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existentsProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      let checkInexistentProductMessage = '';

      checkInexistentProducts.forEach(checkInexistentProduct => {
        checkInexistentProductMessage += `\nCould not find product ${checkInexistentProduct.id}`;
      });

      throw new AppError(checkInexistentProductMessage);
    }

    const findProductsWithNoQuantityAvailable = products.filter(
      product =>
        existentsProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (findProductsWithNoQuantityAvailable.length) {
      let findProductsWithNoQuantityAvailableMessage = '';

      findProductsWithNoQuantityAvailable.forEach(product => {
        findProductsWithNoQuantityAvailableMessage += `\nThe quantity ${product.quantity} is not available for ${product.id}`;
      });

      throw new AppError(findProductsWithNoQuantityAvailableMessage);
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentsProducts.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existentsProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
