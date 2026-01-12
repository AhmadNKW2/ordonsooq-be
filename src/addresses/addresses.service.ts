import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private addressesRepository: Repository<Address>,
  ) {}

  async create(userId: number, createAddressDto: CreateAddressDto): Promise<Address> {
    if (createAddressDto.isDefault) {
      await this.unsetDefaultForUser(userId);
    }

    const address = this.addressesRepository.create({
      ...createAddressDto,
      userId,
    });
    return this.addressesRepository.save(address);
  }

  async findAll(userId: number): Promise<Address[]> {
    return this.addressesRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: number, userId: number): Promise<Address> {
    const address = await this.addressesRepository.findOne({
      where: { id, userId },
    });
    if (!address) {
      throw new NotFoundException(`Address with ID ${id} not found`);
    }
    return address;
  }

  async update(id: number, userId: number, updateAddressDto: UpdateAddressDto): Promise<Address> {
    const address = await this.findOne(id, userId);

    if (updateAddressDto.isDefault) {
      await this.unsetDefaultForUser(userId);
    }

    Object.assign(address, updateAddressDto);
    return this.addressesRepository.save(address);
  }

  async remove(id: number, userId: number): Promise<void> {
    const result = await this.addressesRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException(`Address with ID ${id} not found`);
    }
  }

  private async unsetDefaultForUser(userId: number) {
    await this.addressesRepository.update(
      { userId, isDefault: true },
      { isDefault: false },
    );
  }

  // Admin method
  async findAllByUserId(userId: number): Promise<Address[]> {
      return this.addressesRepository.find({
          where: { userId },
          order: { isDefault: 'DESC', createdAt: 'DESC' }
      });
  }
}
