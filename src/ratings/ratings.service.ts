import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating, RatingStatus } from './entities/rating.entity';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingStatusDto } from './dto/update-rating-status.dto';
import { FilterRatingDto } from './dto/filter-rating.dto';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private ratingsRepository: Repository<Rating>,
  ) {}

  async create(
    createRatingDto: CreateRatingDto,
    userId: number,
  ): Promise<Rating> {
    // Check if user already rated this product
    const existingRating = await this.ratingsRepository.findOne({
      where: {
        userId,
        product_id: createRatingDto.product_id,
      },
    });

    if (existingRating) {
      throw new ConflictException('You have already rated this product');
    }

    const rating = this.ratingsRepository.create({
      ...createRatingDto,
      userId,
      status: RatingStatus.PENDING,
    });

    return await this.ratingsRepository.save(rating);
  }

  async findAll(filterDto: FilterRatingDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      status,
      product_id,
      userId,
      minRating,
      maxRating,
    } = filterDto;

    const queryBuilder = this.ratingsRepository
      .createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .leftJoinAndSelect('rating.product', 'product');

    if (status) {
      queryBuilder.andWhere('rating.status = :status', { status });
    }

    if (product_id) {
      queryBuilder.andWhere('rating.product_id = :product_id', { product_id });
    }

    if (userId) {
      queryBuilder.andWhere('rating.userId = :userId', { userId });
    }

    if (minRating !== undefined) {
      queryBuilder.andWhere('rating.rating >= :minRating', { minRating });
    }

    if (maxRating !== undefined) {
      queryBuilder.andWhere('rating.rating <= :maxRating', { maxRating });
    }

    queryBuilder
      .orderBy(`rating.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      message: 'Ratings retrieved successfully',
    };
  }
  async findOne(id: number): Promise<Rating> {
    const rating = await this.ratingsRepository.findOne({
      where: { id },
      relations: ['user', 'product'],
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    return rating;
  }

  async updateStatus(
    id: number,
    updateStatusDto: UpdateRatingStatusDto,
  ): Promise<Rating> {
    const rating = await this.findOne(id);

    if (
      updateStatusDto.status === RatingStatus.REJECTED &&
      !updateStatusDto.rejectionReason
    ) {
      throw new ConflictException(
        'Rejection reason is required when rejecting a rating',
      );
    }

    rating.status = updateStatusDto.status;
    if (updateStatusDto.rejectionReason) {
      rating.rejectionReason = updateStatusDto.rejectionReason;
    }

    return await this.ratingsRepository.save(rating);
  }

  async delete(
    id: number,
    userId: number,
    isAdmin: boolean = false,
  ): Promise<void> {
    const rating = await this.findOne(id);

    // Only allow owner or admin to delete
    if (!isAdmin && rating.userId !== userId) {
      throw new ForbiddenException('You can only delete your own ratings');
    }

    await this.ratingsRepository.remove(rating);
  }

  async getProductRatings(product_id: number) {
    const ratings = await this.ratingsRepository.find({
      where: {
        product_id,
        status: RatingStatus.APPROVED,
      },
      relations: ['user'],
      order: {
        createdAt: 'DESC',
      },
    });

    const total = ratings.length;
    const averageRating =
      total > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    return {
      data: {
        ratings,
        statistics: {
          total,
          averageRating: Math.round(averageRating * 100) / 100,
        },
      },
      message: 'Product ratings retrieved successfully',
    };
  }
}
