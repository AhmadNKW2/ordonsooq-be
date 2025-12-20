import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import { Wishlist } from '../wishlist/entities/wishlist.entity';
import { Product, ProductStatus } from '../products/entities/product.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { product_ids, ...userData } = createUserDto;

    const existingUser = await this.usersRepository.findOne({
      where: { email: userData.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create user with specified role or default to USER
    const user = this.usersRepository.create({
      ...userData,
      password: hashedPassword,
      role: userData.role || UserRole.USER, // Default to USER if not specified
    });

    const savedUser = await this.usersRepository.save(user);

    // Sync products to wishlist if provided
    if (product_ids && product_ids.length > 0) {
      await this.syncProductsToWishlist(savedUser.id, product_ids);
    }

    return savedUser;
  }

  async findAll(filterDto?: FilterUserDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      role,
      isActive,
      search,
    } = filterDto || {};

    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.role',
        'user.isActive',
        'user.createdAt',
        'user.updatedAt',
      ]);

    // Filter by role
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    // Filter by isActive
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    // Search
    if (search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sorting
    queryBuilder.orderBy(`user.${sortBy}`, sortOrder);

    // Pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get user's wishlist with full product details
    const wishlistItems = await this.wishlistRepository.find({
      where: { user_id: id },
      relations: [
        'product',
        'product.media',
        'product.vendor',
        'product.category',
        'product.productCategories',
        'product.productCategories.category',
        'product.priceGroups',
        'product.weightGroups',
        'product.stock',
        'product.variants',
        'product.variants.combinations',
        'product.variants.combinations.attribute_value',
        'product.variants.combinations.attribute_value.attribute',
        'product.attributes',
        'product.attributes.attribute',
      ],
      order: { created_at: 'DESC' },
    });

    // Map wishlist items with full product details
    const wishlist = wishlistItems.map((item) => {
      const product = item.product;
      const primaryMedia = product?.media?.find((m) => m.is_primary);
      const firstMedia = product?.media?.[0];
      const image = primaryMedia?.url || firstMedia?.url || null;

      return {
        id: item.id,
        product_id: item.product_id,
        added_at: item.created_at,
        product: product
          ? {
              id: product.id,
              name_en: product.name_en,
              name_ar: product.name_ar,
              sku: product.sku,
              short_description_en: product.short_description_en,
              short_description_ar: product.short_description_ar,
              long_description_en: product.long_description_en,
              long_description_ar: product.long_description_ar,
              status: product.status,
              visible: product.visible,
              image,
              average_rating: product.average_rating,
              total_ratings: product.total_ratings,
              created_at: product.created_at,
              vendor: product.vendor
                ? {
                    id: product.vendor.id,
                    name_en: product.vendor.name_en,
                    name_ar: product.vendor.name_ar,
                    logo: product.vendor.logo,
                  }
                : null,
              category: product.category
                ? {
                    id: product.category.id,
                    name_en: product.category.name_en,
                    name_ar: product.category.name_ar,
                  }
                : null,
              categories:
                product.productCategories?.map((pc) => ({
                  id: pc.category?.id,
                  name_en: pc.category?.name_en,
                  name_ar: pc.category?.name_ar,
                })) || [],
              media:
                product.media?.map((m) => ({
                  id: m.id,
                  url: m.url,
                  type: m.type,
                  is_primary: m.is_primary,
                })) || [],
              priceGroups: product.priceGroups || [],
              weightGroups: product.weightGroups || [],
              stock: product.stock || [],
              variants:
                product.variants?.map((v) => ({
                  id: v.id,
                  is_active: v.is_active,
                  combinations: v.combinations,
                })) || [],
              attributes:
                product.attributes?.map((attr) => ({
                  id: attr.id,
                  controls_pricing: attr.controls_pricing,
                  controls_media: attr.controls_media,
                  controls_weight: attr.controls_weight,
                  attribute: attr.attribute
                    ? {
                        id: attr.attribute.id,
                        name_en: attr.attribute.name_en,
                        name_ar: attr.attribute.name_ar,
                      }
                    : null,
                })) || [],
            }
          : null,
      };
    });

    // Exclude password from response
    const { password, ...userWithoutPassword } = user;

    return {
      ...userWithoutPassword,
      wishlist,
    };
  }

  async findOneById(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepository.findOne({ where: { email } });
  }

  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  async updatePassword(userId: number, newPassword: string): Promise<void> {
    const user = await this.findOneById(userId);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await this.usersRepository.save(user);
  }

  // Update user (including role)
  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const { product_ids, ...updateData } = updateUserDto;
    const user = await this.findOneById(id);

    // Update fields
    Object.assign(user, updateData);

    const savedUser = await this.usersRepository.save(user);

    // Sync products to wishlist if provided
    if (product_ids !== undefined) {
      await this.syncProductsToWishlist(id, product_ids);
    }

    return savedUser;
  }

  /**
   * Sync products to user's wishlist (replaces existing wishlist)
   */
  private async syncProductsToWishlist(
    userId: number,
    product_ids: number[],
  ): Promise<void> {
    // Remove all existing wishlist items for this user
    await this.wishlistRepository.delete({ user_id: userId });

    if (product_ids.length === 0) return;

    // Validate products exist and are active
    const validProducts = await this.productRepository.find({
      where: { id: In(product_ids), status: ProductStatus.ACTIVE },
      select: ['id'],
    });

    const validProductIds = validProducts.map((p) => p.id);

    // Create new wishlist items
    const wishlistItems = validProductIds.map((productId) =>
      this.wishlistRepository.create({
        user_id: userId,
        product_id: productId,
      }),
    );

    if (wishlistItems.length > 0) {
      await this.wishlistRepository.save(wishlistItems);
    }
  }

  // Delete user
  async remove(id: number): Promise<void> {
    const user = await this.findOneById(id);
    await this.usersRepository.remove(user);
  }
}
